# Conta do parceiro: extrato estilo conta bancária por estacionamento

**Épico:** E0.3.7 (continuação de [estorno-hibrido.md](./estorno-hibrido.md)).
**Estado:** implementado em 16/09/2026 (migration `20261119230000`, Edge `recipient-withdraw`).
**Decidido por:** Kallef, por AskUserQuestion (três perguntas, todas na opção recomendada).

## Para que serve

Responder, para cada estacionamento, o que uma conta bancária responde: quanto tem, quando o
dinheiro de cada venda libera, quando vai para o banco, o que saiu e por quê, e quanto deve à
Movepark. O mesmo extrato para a equipe (Manager, qualquer empresa) e para o parceiro (Operator,
a própria), sem versão "suavizada".

## Como o dinheiro anda (o que a tela explica)

1. **Da venda para o saldo do recebedor**, na Pagar.me, no momento do pagamento: PIX libera na
   hora; cartão entra como "a liberar" e vira disponível em D+30 por parcela (antecipação é
   opcional e custa taxa). O Hub não segura nada até o check-in.
2. **Do saldo para a conta bancária**, pelo ciclo configurado no recebedor (Recebedores ›
   Configurar repasse): automático diário, semanal ou mensal num dia, ou saque manual. Sem
   configuração própria o recebedor herda o padrão da conta Pagar.me.

A data de liberação de cada venda vem do recebível do gateway (`payment_date`), apurada junto
com a taxa pelo `reconcile-gateway-fees` e guardada em `payment.partner_release_at`.

## Decisões

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Quem vê | Manager (por empresa, `/manager/companies/:companyId/conta`) e Operator (Financeiro, a própria). Um componente, `PartnerAccount` |
| 2 | Fonte | Nossos registros (venda, estorno, dívida, acerto, repasse, saque) mais a data de liberação lida do gateway. Saques entram pelo webhook `transfer.*` e pela própria Edge de saque |
| 3 | Botões | **Repassar** = saque do saldo do recebedor para o banco dele (hub_admin ou Dono com `payouts:write`). **Estornar** só no Manager: leva ao cancelamento com estorno da reserva em Reservas |

## O extrato (RPC `partner_account_statement(p_company_id, p_from, p_to)`)

Só hub_admin, ou membro da empresa com `finance:read`. Devolve:

- `header`: status e id do recebedor, `recipient_missing`, saldo disponível, a liberar e já
  transferido (com `balance_synced_at`), ciclo de transferência (`transfer_enabled`,
  `transfer_interval`, `transfer_day`) e `debt_cents` (`payout_debt_cents`).
- `movements`, cada um com `kind`, `at`, `booking_code`, `gross_cents`, `fee_cents`,
  `debt_recovered_cents`, `net_cents` (efeito no saldo do recebedor), `debt_delta_cents`
  (efeito na dívida), `release_at`/`release_status` (venda), `origin` (estorno), `status`, `note`:

| kind | O que é | No saldo | Na dívida |
|---|---|---|---|
| `sale` | venda com split: parte do parceiro menos taxa que ele paga menos abatimento | + líquido | − abatimento |
| `refund` | estorno em que o gateway debitou o parceiro (híbrido) | − o que ele devolveu | 0 |
| `debt` | estorno em que a Movepark absorveu | 0 | + parte do parceiro |
| `settlement` | acerto manual (`payout_debt_settlement`) | 0 | − valor |
| `transfer_in` | repasse da custódia (`payout_transfer`) | + valor | 0 |
| `withdrawal` | saque para o banco (`payout_withdrawal`) | − valor − taxa de saque | 0 |

## Saque (Edge `recipient-withdraw`)

`POST { company_id, amount_cents }` com o JWT. Permissão: hub_admin ou `payouts:write` na
empresa. Exige recebedor ativo e reconhecido pelo gateway. Pré-voo: lê o saldo disponível ao
vivo e recusa (409) se não cobre; leitura ruim aborta (502) em vez de mandar saque que vai
falhar. Pede `POST /transfers` com `recipient_id` (saque, a outra cara da rota do repasse) e
`Idempotency-Key`; grava `payout_withdrawal` com o id do gateway (o webhook `transfer.*` e a
conciliação atualizam o status) e relê o saldo para a tela não mostrar o número de antes.

## Telas

- **Manager › Recebedores**: botão **Conta** por linha. A página tem os quatro cartões
  (disponível, a liberar, vai para o banco, dívida), o mês de referência, "Atualizar saldos"
  (leitura forçada no gateway), **Repassar para o banco** e, na linha da venda, **Estornar**.
- **Operator › Financeiro**: o mesmo componente no topo, sem Estornar; Repassar só para o Dono.

## Testes

pgTAP `partner_account_statement.test.sql` (12): permissão, cabeçalho, os seis tipos de
movimento com os efeitos no saldo e na dívida. Deno: `buildWithdrawalBody`, `partnerReleaseAt`,
`parseWithdrawInput`, `withdrawPreflight`. Vitest: `account.logic`, `PartnerAccount` (saldo,
ciclo, dívida, efeitos, Estornar e o saque em centavos), hooks `usePartnerAccountStatement`
e `useWithdraw`.

## Saque controlado pela Movepark (E0.3.8, 16/09/2026)

Decidido pelo Kallef na sequência: **saque sempre manual** e **o disponível para saque é
nosso, não o saldo bruto da Pagar.me**. O saldo da Pagar.me continua sendo o cofre (o dinheiro
está no recebedor do parceiro, em nome dele) e o teto físico; o nosso razão decide quanto e
quando pode sair. Migration `20261120010000`.

| Decisão | Escolha |
|---|---|
| Quando a venda libera | N dias depois do pagamento. Padrão global `app_setting.payout_release_days` (30), sobrescrito por `company.payout_release_days` (Recebedores › Configurar repasse) |
| Quem saca | O Dono pelo Operator, até o disponível nosso; a Movepark pelo Manager, e só passa do teto com "Passar do disponível calculado" marcado (o gateway continua sendo o teto físico) |
| Taxa de saque | Do parceiro, descontada do saldo pelo gateway |
| Transferência automática | Desligada em todo recebedor (`transfer_enabled = false`); Agência Fera já está |

`payout_withdrawable(company)`:

```
liberado    = Σ líquido das vendas com paid_at + N dias <= agora e partner_release_at <= agora
              + repasses da custódia pagos
retido      = Σ líquido das vendas ainda dentro do prazo
disponível  = max(0, min(liberado − dívida − saques (pagos ou em curso, com taxa),
                         disponível real na Pagar.me))
```

Líquido da venda = perna do parceiro − taxa que ele paga − abatimento de dívida − o que o
gateway já debitou dele em estorno híbrido. Estorno absorvido pela Movepark não sai daqui: entra
pela dívida. A Edge `recipient-withdraw` lê o saldo ao vivo, grava, recalcula o teto no banco e
recusa (409) o que passa dele; `force` só para hub_admin.

A conta mostra "Disponível para saque" (nosso), "Retido pelo prazo" (com o prazo), "A liberar
pelo gateway" (cartão) e a dívida; o saldo bruto da Pagar.me fica como referência pequena.

**No saque, o custo fica explícito, mas não é descontado antes (17/09/2026):** o diálogo mostra
o disponível e a taxa por saque (`app_setting.payout_withdrawal_fee_cents`, devolvida pela RPC em
`withdrawal_fee_cents`). O parceiro pede qualquer valor até o disponível inteiro
(`max_withdraw_cents` = disponível) ou usa "Sacar o máximo". A taxa é cobrada pela Pagar.me do
saldo do recebedor no ato do saque, sempre do recebedor (a Pagar.me não tem como mandar para o
master: "as taxas de saque sempre são cobradas da conta do recebedor que realiza a
transferência"), e entra no razão pelo `fee_cents` de `payout_withdrawal`, abatendo o disponível
seguinte. A Edge só exige que valor mais taxa caibam no saldo real do gateway (migration
`20261120050000`).

## Fora do escopo agora

Antecipação por venda, exportação do extrato e o extrato de operações de saldo do gateway
como segunda opinião (útil para conferir ajustes que não passam por nós).
