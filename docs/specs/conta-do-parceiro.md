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

## Fora do escopo agora

Antecipação por venda, exportação do extrato e o extrato de operações de saldo do gateway
como segunda opinião (útil para conferir ajustes que não passam por nós).
