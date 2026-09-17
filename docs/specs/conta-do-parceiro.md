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
2. **Do saldo para a conta bancária**, só por saque manual (botão "Repassar para o banco" na
   conta). A transferência automática da Pagar.me fica desligada em todo recebedor e não tem
   mais UI que a religue: o que a Movepark configura por empresa é o prazo de liberação
   (Recebedores › Prazo de saque).

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
  **Sem o saldo da Pagar.me** (17/09/2026): o parceiro não vê o saldo bruto do recebedor, o
  cartão "a liberar pelo gateway" nem o botão "Atualizar saldos", e a tela não força leitura no
  gateway. O que ele pode tirar é o nosso "disponível para saque"; mostrar o saldo real só
  geraria a pergunta "por que não posso sacar". Manager continua vendo tudo (`showGateway`).

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
| Quando a venda libera | N dias depois do pagamento. Padrão global `app_setting.payout_release_days` (30), sobrescrito por `company.payout_release_days` (Recebedores › Prazo de saque) |
| Quem saca | O Dono pelo Operator, até o disponível nosso; a Movepark pelo Manager, e só passa do teto com "Passar do disponível calculado" marcado (o gateway continua sendo o teto físico) |
| Taxa de saque | Do parceiro, descontada do saldo pelo gateway |
| Recebedor negativo | A Pagar.me pede para nunca deixar (arrasta o saldo do master e pode travar estorno). Quando a leitura do gateway vem abaixo de zero, Recebedores mostra um alerta no topo com as empresas e o buraco somado, a linha fica em vermelho com o selo "Saldo negativo", e a conta da empresa abre com o alerta: o Manager lê o efeito no master, o parceiro lê que as próximas vendas cobrem antes de qualquer saque (`negativeRecipientAlert`) |
| Transferência automática | Desligada em todo recebedor (`transfer_enabled = false`, default global `payout_transfer_enabled = 'false'` no create). Desde 17/09/2026 o diálogo de repasse não oferece mais ligar, recorrência nem dia; o Operator perdeu o botão "Configurar recebimento" |

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

**A Movepark pode passar do disponível calculado (17/09/2026).** No diálogo do Manager aparecem
os dois números, "Disponível pela Movepark" (o nosso) e "Saldo no recebedor (Pagar.me)"; "Sacar
o máximo" preenche o saldo do recebedor e o teto é ele. Quando o valor passa do nosso, o diálogo
avisa em âmbar quanto ainda não liberou pelo prazo do parceiro e manda `force: true` sozinho; não
há mais checkbox. O parceiro segue limitado ao nosso disponível, e o botão "Repassar para o banco"
desabilitado explica o motivo num tooltip (prazo, dívida, recebedor ou gateway zerado).

A conta mostra "Disponível para saque" (nosso), "Retido pelo prazo" (com o prazo), "A liberar
pelo gateway" (cartão) e a dívida; o saldo bruto da Pagar.me fica como referência pequena.

**No saque, a taxa sai de dentro do valor (fechado em 17/09/2026):** o diálogo mostra o
disponível e a taxa por saque (`app_setting.payout_withdrawal_fee_cents`, devolvida pela RPC em
`withdrawal_fee_cents`). O parceiro pede qualquer valor A até o disponível inteiro
(`max_withdraw_cents` = disponível) ou usa "Sacar o máximo", e a tela avisa antes de confirmar:
"sai do saldo A · taxa · cai na conta A − taxa". A Edge pede ao gateway A − taxa; a Pagar.me
cobra a taxa do saldo do recebedor (sempre do recebedor, não há API para mandar ao master), então
do recebedor sai exatamente A. `payout_withdrawal` guarda `amount_cents` = o que foi ao banco e
`fee_cents` = a taxa; a soma é o que saiu do saldo e abate o disponível seguinte. O disponível
nunca chega já com a taxa descontada; ela só aparece no saque (migration `20261120050000`).

## Controle de saques (E0.3.10, 17/09/2026)

**Problema.** O saque nascia com o status da resposta do `POST /transfers` e ninguém o relia: o
webhook `transfer.*` nunca chegou nesta conta, e a conciliação (`reconcile-payout-transfers`) só
olhava o repasse da custódia. Um saque ficaria "Processando" para sempre, sem previsão de quando
cai nem confirmação de que caiu.

**O que a Pagar.me devolve na transferência** (`POST /transfers` e `GET /transfers/{id}`):
`status` (`pending_transfer`, `processing`, `transferred`, `failed`, `canceled`), `fee`,
`funding_estimated_date` (previsão de crédito), `funding_date` (quando creditou) e `bank_response`
(motivo do banco na falha). Saque manual pedido até as 15h de Brasília em dia útil cai no mesmo dia;
depois, ou em fim de semana, no próximo dia útil.

**Modelo.** `payout_withdrawal` ganhou `expected_at`, `gateway_status`, `failure_reason` e
`synced_at` (migration `20261120090000_controle_de_saques.sql`). Uma regra só escreve a linha,
`_shared/payments/withdrawal.ts`:

- `transferStatusToWithdrawalStatus` e `nextWithdrawalStatus`: terminal nunca reabre, `created`
  não rebaixa `processing`.
- `expectedFundingDate(requestedAt)`: a regra das 15h em dia útil (fim do dia BRT), usada só
  quando o gateway não devolve `funding_estimated_date`. Feriado não entra: quando o gateway manda
  a data, ela prevalece.
- `withdrawalPatch({ result, nowIso, current })`: o que gravar a partir de uma leitura (resposta
  do POST, evento do webhook ou GET da conciliação). Erro HTTP não escreve nada.

**Quem escreve.** `recipient-withdraw` grava a linha com a previsão e deixa rastro em
`payment_gateway_event` (kind `withdrawal`, sem reserva). `reconcile-payout-transfers` (cron a
cada 15 min) relê os saques em `created`/`processing` com `GET /transfers/{id}` e fecha como
pago (com `funding_date`), falhou (com `bank_response`) ou cancelado; o Manager chama a mesma
Edge com JWT de hub_admin pelo botão "Conferir no gateway". O webhook `transfer.*`, se um dia
chegar, grava as mesmas datas.

**Telas.** Card "Saques para o banco" (`WithdrawalsCard`): pedido em, vai ao banco, taxa, status
(Solicitado, Em trânsito, Caiu na conta, Falhou, Cancelado) e "Chega em" (previsto para X;
previsto para X, ainda não caiu, em vermelho quando passou o dia; caiu em X; falhou: motivo). Ele
aparece na conta de cada estacionamento (Manager e Operator, o parceiro vê o mesmo) e em Manager ›
Financeiro › Repasses com todas as empresas e o botão de conferir. No extrato, a linha do saque
traz a mesma informação na coluna Liberação (`release_at`/`release_status` do movimento).

**Testes.** Deno `withdrawal.test.ts` (regra das 15h, patch, terminal); pgTAP
`partner_account_statement.test.sql` (15: saque pago, em curso com previsão, falhado com motivo);
Vitest `withdrawal.logic.test.ts`, `WithdrawalsCard.test.tsx`.

## Fora do escopo agora

Antecipação por venda, exportação do extrato e o extrato de operações de saldo do gateway
como segunda opinião (útil para conferir ajustes que não passam por nós).
