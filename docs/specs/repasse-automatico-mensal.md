# Repasse automático mensal (grátis) e saque manual (com taxa)

**Épico:** E0.3.13 (continuação de [conta-do-parceiro.md](./conta-do-parceiro.md)).
**Estado:** desenhado em 26/09/2026, aprovado pelo Kallef por AskUserQuestion (quatro perguntas). Plano
em `docs/superpowers/plans/2026-09-26-repasse-automatico-mensal.md`.

## Para que serve

Hoje o dinheiro do parceiro só sai do recebedor por saque manual, e cada saque custa R$ 3,67 dele.
Passa a existir um **repasse mensal automático**, no mesmo dia para todo estacionamento (padrão
global) e configurável por empresa, como a comissão. O parceiro sabe **quando** cai e **quanto** vai
cair, e não paga nada por esse repasse: a taxa do gateway fica por conta da Movepark. O saque manual
continua existindo para quem não quer esperar, e aí a taxa da Pagar.me é dele, dito na tela antes de
confirmar.

## Decisões

| # | Pergunta | Decisão | Por quê |
|---|---|---|---|
| 1 | Quem executa o repasse do dia X | **Nosso cron**, chamando o mesmo saque do botão Repassar | A transferência automática nativa da Pagar.me saca o saldo inteiro (ignora o prazo de liberação e a dívida), desliga sozinha em recebedor sem transação por 60 dias e debita a taxa sem a gente saber quando. Com o nosso cron tudo que existe segue valendo: extrato, controle de saque, previsão de queda, e-mails |
| 2 | Dia padrão | **10** | Padrão do B2B brasileiro (fecha dia 1, paga dia 10), o dia que a Virapark já usava no ciclo antigo, e dá à equipe os primeiros dias do mês para conferir o extrato antes de o dinheiro sair. Se cai em fim de semana ou feriado, a Pagar.me liquida no dia útil seguinte (a previsão de queda que já existe cobre isso) |
| 3 | Valor mínimo | **R$ 50,00** | A Movepark devolve a taxa de cada repasse automático; abaixo do mínimo o valor acumula para o mês seguinte, e o Operator vê isso escrito |
| 4 | A taxa | **Por conta da Movepark, devolvida no split da próxima venda** | A Pagar.me debita R$ 3,67 do recebedor em todo saque, automático ou não (medido nos três saques reais de 17/09), e não há transferência entre recebedores. O único caminho automático para a Movepark devolver é o split dinâmico, que já existe no sentido oposto (abatimento de dívida) |

## Como funciona

### Configuração (o dia é como a comissão: global com override por empresa)

`app_setting`: `payout_auto_enabled` (`true`), `payout_auto_day` (`10`), `payout_auto_min_cents`
(`5000`). `company.payout_auto_day` e `company.payout_auto_enabled` nulos herdam o global, no mesmo
desenho de `payout_release_days`. Dia 29, 30 ou 31 em mês mais curto roda no último dia do mês.

Manager: a aba **Pagamentos** de Configurações ganha o card "Repasse automático" (liga, dia,
mínimo). Em Recebedores, o diálogo "Prazo de saque" vira **"Repasse"**: prazo de liberação, dia do
repasse automático e liga/desliga da empresa. RPC `company_set_payout_schedule(p_company_id, p_day,
p_enabled)`, só hub_admin.

### Execução (o cron chama o saque de sempre)

O miolo do `recipient-withdraw` sai para `_shared/payments/performWithdrawal.ts`, e as duas Edges
(manual e automática) chamam a mesma função: pré-voo de saldo, teto do nosso disponível, pedido ao
gateway com `Idempotency-Key`, linha em `payout_withdrawal`, e-mails, rastro do gateway, releitura
do saldo.

Cron `payout-auto-run`, diário às 12:00 UTC (9h de Brasília), chama a Edge `payout-auto-run` com a
chave do Vault (`payout_auto_key`, padrão do `reconcile-refunds`). A Edge aceita também JWT de
hub_admin, para rodar à mão. Ela:

1. pede ao banco quem é hoje (`payout_auto_due(p_today)`): empresa com recebedor ativo e existente
   no gateway, repasse ligado (empresa ou global), dia resolvido igual a hoje (ou último dia do mês
   quando o dia não existe), e **sem ciclo aberto neste mês**;
2. para cada uma, abre o ciclo (`payout_auto_cycle`, unique por empresa e mês: rodar duas vezes não
   saca duas vezes), relê o saldo no gateway, calcula `payout_withdrawable`;
3. abaixo do mínimo: fecha o ciclo como `below_min` com o valor que ficou acumulando; recebedor sem
   saldo no gateway: `no_balance`; senão pede o saque de **todo o disponível** com `origin =
   'automatic'` e `fee_borne_by = 'movepark'`, e fecha como `paid` (ou `failed`, com o motivo).

Falha de gateway numa empresa não derruba as outras: cada uma fecha o próprio ciclo, e um resumo
sai no log e no rastro do gateway.

### A taxa (grátis para o parceiro, paga pela Movepark)

`payout_withdrawal` ganha `origin` (`manual`/`automatic`), `fee_borne_by` (`partner`/`movepark`) e
`cycle_id`. Três efeitos:

- **Razão do parceiro** (`payout_withdrawable`): o saque só desconta `amount + fee` quando a taxa é
  dele; no automático desconta só `amount`. O saldo real do recebedor caiu `amount + fee`, então o
  disponível fica limitado pelo teto do gateway até o crédito voltar, o que é o comportamento certo
  (não se saca o que não está lá).
- **Crédito** (`payout_fee_credit_cents(company)`): soma das taxas por conta da Movepark em saques
  vivos (`created`/`processing`/`paid`) menos o que já foi devolvido em cobranças vivas
  (`payment.fee_credit_returned_cents`, paga ou pendente dentro da validade, espelho da regra da
  dívida). Reserva com lock por empresa (`payout_fee_credit_reserve`), para duas vendas simultâneas
  não devolverem o mesmo crédito.
- **Split**: `splitForGateway` ganha `feeCreditCents`. Depois do abatimento de dívida, a perna da
  Movepark cede o crédito à do parceiro, sem mexer no total. A perna da Movepark nunca fica abaixo
  de R$ 1,00 (regra com zero centavos o gateway recusa; o resto do crédito espera a venda seguinte).
  As Edges `create-pix-charge` e `create-card-charge` gravam `fee_credit_returned_cents` e
  `fee_credit_reservation_id` na `payment`.

Custo da Movepark: R$ 3,67 por estacionamento por mês, e só quando o repasse sai.

### O que o parceiro vê

Operator › Financeiro e Manager › Conta, no topo do `PartnerAccount`, card **"Próximo repasse
automático"**: a data (`payout_next_auto_at`), o valor previsto (`payout_auto_forecast`: o que
estará liberado pelo prazo até aquela data, mais repasses de custódia, menos dívida e saques, no teto
do saldo do gateway somado ao a liberar), e a frase "sem taxa para você". Abaixo do mínimo: "abaixo
de R$ 50,00 acumula para o mês seguinte". Repasse desligado: "repasse automático desligado para
esta empresa" (o Manager vê o motivo; o Operator vê "fale com a Movepark"). Último ciclo: "último
repasse automático em 10/09: R$ X" ou o motivo de não ter saído.

O botão **"Repassar agora"** e o diálogo passam a dizer: "Saque manual: a Pagar.me cobra R$ 3,67 do
seu saldo. O repasse automático do dia 10 não tem taxa para você." No extrato o saque automático
aparece com a origem e "taxa por conta da Movepark", e a devolução aparece na venda que a trouxe
(`fee_credit` na movimentação). Os e-mails de saque pedido e caído ganham a variante automática
(assunto "Seu repasse mensal de R$ X está a caminho"; a linha da taxa vira "sem taxa para você").

`/seja-parceiro` ganha a pergunta "Quando eu recebo?" na FAQ do parceiro, com a regra em uma frase.

## Modelo

| Peça | Onde |
|---|---|
| Chaves globais | `app_setting.payout_auto_enabled`, `payout_auto_day`, `payout_auto_min_cents` |
| Override por empresa | `company.payout_auto_day` (1..31, nulo herda), `company.payout_auto_enabled` (nulo herda) |
| Resolução | `payout_auto_schedule(p_company_id)` → jsonb `{enabled, day, min_cents, next_at, source}` |
| Próxima data | `payout_next_auto_at(p_company_id, p_from date default today BRT)` → date |
| Previsão | `payout_auto_forecast(p_company_id)` → jsonb `{enabled, day, next_at, forecast_cents, min_cents, below_min, last_cycle}` |
| Quem é hoje | `payout_auto_due(p_today date)` → setof (company_id, day) ; só service_role |
| Ciclo | `payout_auto_cycle (id, company_id, cycle_month date, scheduled_for date, ran_at, outcome text check in ('running','paid','below_min','no_balance','no_recipient','failed'), available_cents, amount_cents, withdrawal_id, reason, created_at)`, unique `(company_id, cycle_month)`; RLS: hub_admin tudo, operador SELECT das próprias |
| Saque | `payout_withdrawal.origin`, `fee_borne_by`, `cycle_id` |
| Crédito | `payout_fee_credit_cents(p_company_id)`, `payout_fee_credit_reserve(p_company_id, p_max_cents)` + tabela `payout_fee_credit_reservation`; `payment.fee_credit_returned_cents`, `payment.fee_credit_reservation_id` |
| Chave do cron | Vault `payout_auto_key` + `payout_auto_expected_key()` (só service_role) |
| Cron | `payout-auto-run`, `0 12 * * *` |
| Edge | `payout-auto-run` (chave ou JWT de hub_admin; `{ dry_run?: boolean, company_id?: uuid }`) |
| Compartilhado | `_shared/payments/performWithdrawal.ts` |
| Front | `PayoutScheduleCard` (conta), `PayoutAutoSettings` (Configurações), `PayoutSettingsDialog` renomeado "Repasse", copy do diálogo de saque, FAQ do parceiro |

## Testes

- pgTAP `payout_auto.test.sql`: resolução global/empresa, dia 31 em setembro cai em 30, próxima
  data quando hoje já passou do dia, `payout_auto_due` exclui ciclo aberto, recebedor ausente e
  empresa desligada, previsão com venda liberando antes e depois da data, `payout_withdrawable`
  ignorando a taxa por conta da Movepark, crédito e reserva, RLS do ciclo.
- Deno: `performWithdrawal` (pré-voo, teto, gravação com origem), `payout-auto-run/logic.test.ts`
  (seleção e resultado por empresa como funções puras), `split.test.ts` (crédito depois da dívida,
  piso de R$ 1,00, total intacto).
- Vitest: `PayoutScheduleCard`, copy do diálogo de saque, `PayoutAutoSettings`, diálogo por empresa.
- Windup: `operator-finance` confere "Próximo repasse automático".

## Rollout e prova

Migration, tipos, deploy de `recipient-withdraw`, `payout-auto-run`, `create-pix-charge` e
`create-card-charge`, chave no Vault, cron. Prova real antes do dia 10: o dia da Agência Fera vira
o de hoje, a Edge roda à mão, o saque sai sem taxa no razão, o crédito de R$ 3,67 aparece, uma
compra de teste devolve o crédito no split, e o dia volta a herdar. Primeiro ciclo geral em
10/10/2026.
