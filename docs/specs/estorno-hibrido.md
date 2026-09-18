# Estorno híbrido: o gateway debita o parceiro quando ele tem saldo

**Épico:** E0.3.6 (continuação de [split-dinamico-e-divida-do-parceiro.md](./split-dinamico-e-divida-do-parceiro.md)).
**Estado:** implementada em 16/09/2026 (migration `20261119190000`, Edges no ar). Chave
`pagarme_refund_hybrid_enabled` nasce desligada; liga no card do master em Financeiro › Repasses
depois do teste real.
**Decidido por:** Kallef, por AskUserQuestion, nas quatro perguntas abaixo (todas na opção recomendada).

## Por que existe

No modelo E0.3.5 todo estorno de venda com split sai 100% do master da Movepark, e a parte que o
parceiro já recebeu vira dívida no razão, recuperada no split das vendas seguintes. Funciona, e
foi provado em 16/09/2026 (MP-95FBB5: master 205,25 para 156,35, recebedor da Agência Fera
intacto, dívida de R$ 28,80). Mas tem dois custos que crescem com o volume:

1. **Caixa parado.** A Movepark é o banco do estorno. O master precisa de colchão (piso de
   R$ 3.000 configurado; estava em R$ 156 no dia do teste) e o primeiro dia forte de
   cancelamentos trava estornos na fila manual.
2. **Dívida órfã.** A recuperação depende de o parceiro seguir vendendo. Parceiro suspenso ou
   que saiu da rede deixa a dívida parada, e a cobrança vira contrato e telefone.

O híbrido ataca os dois no caso comum: **se o recebedor do parceiro tem saldo disponível que
cobre a parte dele, o estorno vai com split e a Pagar.me debita o parceiro; a dívida nem
nasce.** Só quando o saldo não cobre a Movepark absorve e registra, exatamente como hoje. Para o
cliente nada muda: o dinheiro volta do mesmo jeito e no mesmo prazo.

## Decisões

| # | Pergunta | Decisão | Por quê |
|---|---|---|---|
| 1 | Que saldo conta | **Só o disponível** (`available`), lido ao vivo na hora do estorno | Nunca deixa recebedor negativo, que é o que a Pagar.me pede. Custo aceito: cartão estornado dentro dos 30 dias quase sempre cai na dívida, porque a parte do parceiro ainda está "a receber" |
| 2 | Quanto o parceiro devolve | **O líquido que recebeu**: parte dele menos a taxa de processamento que ele pagou na captura | Mantém a decisão de 15/09 de a Movepark absorver as taxas do estorno. O parceiro fecha a venda cancelada em zero, sem centavos negativos que geram pergunta. Desde 17/09/2026 a dívida (caminho do master) segue a mesma conta: ver [split-dinamico-e-divida-do-parceiro.md](./split-dinamico-e-divida-do-parceiro.md) |
| 3 | Chargeback | **Fica 100% no master**, como hoje | O `liable` é fixado na captura e o gateway debita sem olhar saldo; não há como escolher na hora |
| 4 | Ativação | **Chave global `pagarme_refund_hybrid_enabled`**, nasce `false` | Sobe inerte, um teste com a chave ligada, depois liga para todos. Desligar volta ao 100% master na hora |

## De qual saldo o estorno sai (18/09/2026)

Confirmado pelo suporte da Pagar.me depois de quatro recusas `action_forbidden | Saldo
insuficiente.` no MP-6CFA4B, com R$ 159,59 disponíveis no master: **estorno de cartão é debitado
do saldo a receber** (vendas de crédito ainda não liquidadas), e ele precisa ser **maior ou igual
ao valor estornado**. PIX sai do disponível. Consequências:

- A decisão 1 ("só o disponível") vale para PIX. No cartão o híbrido compara o líquido do
  parceiro com o **saldo a receber** dele (`refundableBalanceCents`, `payment.method`).
- Uma venda de cartão sozinha nunca se estorna com o próprio recebível: entram R$ 30,90, a taxa
  (R$ 1,17) sai na hora, e o saldo a receber fica em R$ 29,73, menor que os R$ 30,90 a devolver.
  Falta sempre a taxa, que precisa vir de OUTRAS vendas de cartão a receber do mesmo recebedor.
  Com volume isso some; no começo (e em teste) a recusa é esperada e cai na fila manual, que tem
  "Tentar de novo no gateway".
- A recusa vem dentro de um HTTP 200 (`last_transaction.status = failed`); `buildRefundResult`
  lê isso e o cancelamento segue para a fila manual.
- Quando o gateway confirma depois (`charge.refunded`), o webhook fecha a linha pendente da fila.

## A regra

Para um estorno de `payment` capturado com split (`split_sent_to_gateway = true`, perna do
parceiro com valor depois do abatimento), de `R` centavos sobre um total `T`:

```
parte_bruta_parceiro = perna_parceiro_liquida_de_abatimento * R / T      (arredondado para baixo)
taxa_parceiro        = gateway_fee_cents * R / T   se a perna do parceiro tem charge_processing_fee
                     = 0                            caso contrário
devolve_parceiro     = parte_bruta_parceiro - taxa_parceiro
devolve_master       = R - devolve_parceiro
```

O gateway debita o parceiro **se, e só se**:

- a chave está ligada;
- `devolve_parceiro > 0`;
- a leitura ao vivo do saldo do recebedor devolveu `availableCents >= devolve_parceiro`;
- a taxa do gateway é conhecida: `gateway_fee_cents` já apurado pelo `reconcile-gateway-fees`
  (a cada 30 min, e só dez minutos depois do pago) ou, quando ainda não está, lida ao vivo em
  `GET /payables` na hora do estorno (o valor lido é gravado). Só sem recebível nenhum a regra
  cai no fallback;
- o recebedor não está marcado `gateway_missing_at`.

Qualquer condição falsa, leitura de saldo com erro, ou recusa do gateway ao estorno com split:
**fallback para o estorno 100% master**, que é o comportamento de hoje, com dívida registrada.
Recusa ao segundo pedido (100% master) segue a classificação atual: definitiva vai para a fila
manual, incerta aborta e pede retry.

Nunca se tenta o split com o parceiro negativo e nunca se usa `waiting_funds` (decisão 1).

### O que vai ao gateway

`DELETE /charges/{id}` com `amount = R` e duas regras `flat`: parceiro com `devolve_parceiro`
e master com `devolve_master`, `liable` e as taxas de estorno na perna do master
(`charge_processing_fee` e `charge_remainder_fee` = true no master, false no parceiro). O adapter
já monta esse corpo (`buildRefundBody`); a única mudança é quem calcula as regras.

## O que grava

| Coluna | Estorno debitado do parceiro | Estorno 100% master (hoje) |
|---|---|---|
| `payment.refund_absorbed_by_master` | `false` | `true` |
| `payment.refund_split` (nova, jsonb) | as duas regras enviadas | a regra do master |
| `payment.refund_partner_cents` (nova, int) | `devolve_parceiro` | `0` |
| `payment.refund_partner_balance_cents` (nova, int) | saldo lido na decisão | `null` |
| `payout_debt_cents` | não conta esta venda | conta a parte do parceiro, como hoje |

`payout_statement` passa a mostrar a linha estornada com quem pagou ("gateway debitou o
parceiro" ou "Movepark absorveu"), e o card de dívida continua lendo só as absorvidas.

A leitura ao vivo do saldo grava também em `payout_recipient.balance_*` (mesmo patch do
`refresh-recipients`), então o Manager fica com o número mais fresco que existe.

## Onde mexe

- `_shared/payments/refund.ts`: `executeRefund` ganha o passo de decisão. Nova função pura
  `decideRefundSplit({payment, feeCents, balance, settings, amountCents, totalCents})` devolvendo
  `{mode: "partner" | "master", rules, partnerCents, reason}`, com teste Deno para cada condição
  da regra (chave desligada, sem taxa sincronizada, saldo curto, saldo exato, parcial, perna
  abatida a zero, recebedor sumido).
- `_shared/payments/settings.ts`: `refundHybridEnabled` em `loadGatewaySettings`.
- `_shared/payments/split.ts`: `refundSplitHybrid(moveparkId, partnerId, partnerCents, totalCents)`.
- Os cinco chamadores de `executeRefund` (cancel-booking, pagarme-webhook, reconcile-confirmations,
  delete-account, change-booking-dates-paid) não mudam a chamada; passam a gravar os três campos
  novos que `RefundExecution` devolve.
- Migration: colunas em `payment`, `app_setting.pagarme_refund_hybrid_enabled = false`,
  `payout_statement` com a origem do estorno, `payout_debt_lines` inalterada (já lê a flag).
- Manager: Financeiro › Repasses mostra na linha estornada quem pagou; o card do master ganha o
  interruptor "Estorno híbrido" (só hub_admin, RPC `app_setting_set_bool`), ao lado do colchão.
- Alerta de recebedor com saldo negativo no gateway (deveria ser impossível com a decisão 1;
  se aparecer, é corrida entre a leitura e o débito): **ainda não feito**; fica para depois do
  primeiro mês com a chave ligada, quando se sabe se o caso existe.

## Corrida entre a leitura e o débito

Entre ler o saldo e a Pagar.me processar o estorno há segundos. Se o parceiro sacar nesse
intervalo, o gateway pode levar o recebedor a negativo. Aceito, porque a janela é mínima, o
valor é a parte de uma venda, e o alerta acima faz o caso aparecer. Não se mitiga com margem de
segurança porque margem transformaria estorno "cabível" em dívida sem necessidade.

## O que NÃO muda

- Chargeback: master paga, vira dívida, recupera no split (decisão 3).
- Recuperação no split das vendas seguintes, reserva com advisory lock, fila manual, colchão do
  master e o alerta dele.
- Custódia e repasse manual continuam desligados.
- Cancelamento pelo cliente e pelo staff continuam decidindo **se** e **quanto** estornar; esta
  spec só decide **de quem sai**.

## Testes

- Deno: `decideRefundSplit` cobre a tabela da regra; `refundSplitHybrid` cobre a soma exata
  (`partner + master = R`) e o arredondamento para baixo do parceiro.
- pgTAP: `payout_debt_cents` ignora pagamento com `refund_absorbed_by_master = false`;
  `payout_statement` traz a origem; a chave nasce `false`.
- Vitest: linha do extrato com as duas origens; interruptor no card do master (mutation com teste
  no diretório, pelo guard).
- Teste real: venda PIX na Agência Fera com a chave ligada, cancelamento pelo Manager, conferir
  saldo do recebedor caindo o líquido, master caindo só a taxa e o restante, dívida sem nova
  linha.

## Rollout

1. Migration e Edges no ar com a chave desligada (comportamento idêntico ao de hoje).
2. Venda e cancelamento de teste com a chave ligada.
3. Chave ligada para todos. O primeiro mês fecha com a leitura de quantos estornos foram
   debitados do parceiro e quantos caíram na dívida, para decidir se vale reabrir a decisão 1
   (contar `waiting_funds` no cartão).
