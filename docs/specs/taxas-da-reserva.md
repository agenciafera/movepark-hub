# Taxas da reserva e tabela de taxas (Manager)

**Origem:** a Pare Seguro viu descontos nas vendas online e não entendia de onde vinham (reunião de
11/11/2026, atividade [Enviar tabela detalhada das taxas da Pagar.me](https://app.clickup.com/t/17tn9ea0amp)).
Em 23/11/2026 ficou decidido que, antes de mandar qualquer tabela para fora, a explicação nasce
**dentro do Manager**, para a equipe conferir o que vai aparecer. A visão do estacionamento veio
depois: a tabela geral no Financeiro do Operator (23/11/2026) e o mesmo "Ver taxas" na reserva do
Operator (24/11/2026), as duas descritas no fim desta spec.
**Estado:** implementado em 23/11/2026 (commits `28597bf1`, `d3773446`, `7bdcd446`, `e76e40c1`,
`dc089ed6`). Plano: [`docs/superpowers/plans/2026-11-23-taxas-da-reserva.md`](../superpowers/plans/2026-11-23-taxas-da-reserva.md).
**Relacionadas:** [payment-split.md](./payment-split.md) (split, parcelamento, ADR-004),
[rastro-do-gateway.md](./rastro-do-gateway.md) (de onde vêm os recebíveis),
[antecipacao-do-parceiro.md](./antecipacao-do-parceiro.md) (quem paga a antecipação),
[comissao-por-origem.md](./comissao-por-origem.md) (pacote de comissão congelado na reserva).

## O que existe hoje

- A reserva do Manager já tem o card **Valores** (`BookingMoneyCard`), com o que o cliente pagou, a
  parte do estacionamento e a da Movepark. A taxa do gateway aparece como **um número só**
  (`payment.gateway_fee_cents`) e os juros do parcelamento também.
- O detalhe por parcela **já está no banco**: a cada apuração, `reconcile-gateway-fees` grava o
  `GET /payables` cru no rastro (`payment_gateway_event.kind = 'payables'`). Cada recebível traz
  recebedor, parcela, valor, MDR (`fee`), `anticipation_fee`, `fraud_coverage_fee`,
  `payment_date` e `original_payment_date`. A RPC `booking_gateway_trail` (só `hub_admin`) já
  entrega esses eventos ao Manager.
- O pacote de comissão está congelado na reserva: `commission_channel`, `commission_take_rate_bps`,
  `commission_fee_payer`, `commission_anticipation_payer`, `commission_installments_max` e
  `commission_installments_interest_free`.
- A política de parcelamento vive em `app_setting.card_installment_policy`, editada em
  **Configurações › Pagamentos**, com a lógica em `src/lib/installments.ts`
  (`computeInstallmentPlan`, `applyInstallmentOverride`).
- Das taxas contratadas com a Pagar.me, o banco só guarda duas: a de antecipação
  (`app_setting.card_anticipation_rate_monthly_bps`, que o split já usa para a estimativa) e a de
  saque (`app_setting.payout_withdrawal_fee_cents`). MDR do cartão por faixa, Pix e antifraude não
  estão em lugar nenhum.

## Decisões (23/11/2026)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Onde aparece primeiro | **Manager**, na reserva. No Operator desde 24/11/2026, com a parte do estacionamento |
| 2 | Como abre | Botão **"Ver taxas"** no card Valores, que abre um modal |
| 3 | De onde vem a tabela de taxas da Pagar.me | **Cadastrada no Manager**, com o valor **medido nas vendas** ao lado de cada taxa para mostrar divergência |
| 4 | Onde mais a tabela fica | Também em **Configurações › Pagamentos**, junto da política de parcelamento e da comissão padrão |
| 5 | Onde mora o número | **Só no banco** (`app_setting`, `is_public = false`). O repositório é público e a proposta comercial da Pagar.me tem sigilo: nenhuma taxa contratada entra em migration, seed, teste ou doc |

## O modal "Taxas da reserva"

Abre pelo botão "Ver taxas" no card Valores, só na audiência `manager`. Quatro blocos, nesta ordem:

1. **Resumo.** Três números: o que o cliente pagou (com "Nx de R$ Y" no cartão), o que o
   estacionamento recebe e com quanto a Movepark fica depois das taxas. Os três saem de
   `buildMoneyBreakdown`, a mesma conta do card Valores, para o modal nunca discordar do card.
   Desde 23/11/2026 essa conta considera a antecipação: o `split` gravado é o normal, sem a cessão
   da Movepark, então a cessão sai da Movepark e entra no estacionamento; a taxa do estacionamento
   é a prevista (a cessão) antes da releitura e a real depois; a da perna da Movepark sai dela; o
   crédito devolvido entra no estacionamento. Antes disso o card dava à Movepark a cessão inteira e,
   depois da releitura, cobrava do estacionamento que paga a taxa do cartão também as antecipações.
2. **Taxas cobradas nesta venda.** Uma linha por taxa, com a regra, quem pagou e o valor:
   - **Comissão Movepark:** `commission_take_rate_bps` sobre as diárias, com o canal da regra
     (`commission_channel`) como etiqueta. Quem paga: o estacionamento.
   - **Juros do parcelamento:** valor cobrado menos o total da reserva. Quem paga: o cliente. A
     regra ("x% a.m. acima de Nx") só aparece quando a política de hoje, aplicada ao total da
     reserva com o override congelado, reproduz o valor cobrado. Se não reproduzir, a linha diz
     "condição da época da compra" e não mostra percentual, porque a política pode ter mudado
     depois da venda.
   - **Cartão ou Pix (Pagar.me):** soma do `fee` dos recebíveis de crédito. A regra mostra o
     percentual **efetivo desta venda** (taxa dividida pelo valor cobrado) e, ao lado, o
     contratado da faixa. Se diferirem em mais de 0,05 ponto percentual, a linha ganha o aviso
     "diferente do contrato". Quem paga: quem o split mandou à Pagar.me como pagador da taxa
     (`chargeProcessingFee` da perna do estacionamento, o mesmo `feePayer` do card Valores), que
     nasce de `commission_fee_payer`. Ler do split, e não da coluna, mostra o que de fato foi cobrado.
   - **Antecipação (Pagar.me):** soma do `anticipation_fee`, separada por perna (estacionamento e
     Movepark) e com a data em que o dinheiro entrou. Quem paga: `commission_anticipation_payer`;
     quando é a Movepark, a linha diz quanto ela devolveu ao estacionamento
     (`payment.anticipation_credit_cents`). **Antes da antecipação** (a Pagar.me antecipa por volta do
     D+29, e só aí a taxa aparece nos recebíveis), se a Movepark cedeu a estimativa no split
     (`payment.anticipation_comp_cents`, E0.3.14), a linha mostra a taxa **prevista** (a cessão), a
     data prevista (perto da 1ª parcela) e que as parcelas entram junto com a 1ª; o total do gateway
     ganha "com a antecipação prevista". Só sem cessão e sem antecipação a linha diz "ainda não
     antecipado" (corrigido em 23/11/2026, MP-6C7D84).
   - **Antifraude (Pagar.me):** soma do `fraud_coverage_fee`.
   - **Total do gateway:** soma das três linhas da Pagar.me. Tem que bater com
     `payment.gateway_fee_cents`; se não bater, o modal mostra os dois números e o aviso
     "recebíveis desatualizados", em vez de esconder a diferença.
3. **Parcelas** (só cartão). Uma linha por parcela: valor que o cliente vê na fatura, data
   original de vencimento, data em que o dinheiro entra (`payment_date`, quando houve
   antecipação; antes dela, a data prevista, marcada "(prevista)") e as taxas daquela parcela
   somadas entre os recebedores (MDR e antecipação; antes da antecipação, a prevista dividida pelos
   dias antecipados de cada parcela: 0, 30, 60...). O
   valor da parcela é o do cliente (valor cobrado dividido pelas parcelas, com o resto de centavos,
   se houver, na primeira), e não o recebível de cada recebedor, que o split divide em valores
   diferentes por parcela.
4. **Tabela de taxas.** Dois quadros lado a lado:
   - **Parcelamento desta reserva:** `computeInstallmentPlan` sobre o total da reserva, com o
     override congelado aplicado (`applyInstallmentOverride`), de 1x até o máximo permitido, com a
     opção escolhida destacada. Com a nota "pela política de hoje" quando ela não reproduzir a
     venda (mesma checagem do bloco 2).
   - **Taxas do gateway:** a tabela cadastrada (abaixo), na faixa da venda destacada.

## A tabela de taxas em Configurações › Pagamentos

Bloco novo **"Taxas do gateway"** na aba Pagamentos, editável por `hub_admin`:

| Campo | Onde grava |
|---|---|
| Pix (% sobre o valor) | `app_setting.gateway_fee_schedule` (novo) |
| Cartão por faixa de parcelas (% sobre o valor), faixas contíguas cobrindo 1 a 12 | `app_setting.gateway_fee_schedule` |
| Antifraude (R$ por transação) | `app_setting.gateway_fee_schedule` |
| Antecipação (% ao mês) | `app_setting.card_anticipation_rate_monthly_bps` (já existe; o split usa para a estimativa) |
| Saque para o banco (R$) | `app_setting.payout_withdrawal_fee_cents` (já existe) |

Formato do `gateway_fee_schedule` (percentuais em **bps inteiros**, para não carregar ponto
flutuante):

```json
{
  "version": 1,
  "pix_bps": 0,
  "card": [{ "from": 1, "to": 1, "bps": 0 }, { "from": 2, "to": 6, "bps": 0 }, { "from": 7, "to": 12, "bps": 0 }],
  "antifraud_cents": 0,
  "processing_cents": 0,
  "cet30_bps": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}
```

`processing_cents` é a taxa fixa do gateway por transação e `cet30_bps` é o **custo efetivo total
para receber em 30 dias** (taxa do cartão mais antecipação), de 1x a 12x, a coluna da direita da
tabela de condições da Pagar.me. As duas chaves são opcionais (a tabela gravada antes de 23/11/2026
não as tinha); preenchido pela metade, o formulário recusa. O teto do CET é 50% (o do 12x passa de
20%). No modal, o quadro "Taxas do gateway" mostra de 1x a 12x a taxa da faixa e o custo em 30 dias,
com a linha da venda destacada, mais Pix, antecipação automática ao mês, antifraude e gateway por
transação; o total do gateway da venda ganha "contrato para receber em 30 dias: x% (R$ y)" para
comparar. Pedido do Kallef em 23/11/2026, conforme a reunião do mesmo dia: a tabela que vai ao
parceiro já leva as taxas de 30 dias, porque a antecipação acontece sempre.

Os zeros acima são só a forma: os valores reais são digitados no Manager. Validação no formulário
e na leitura (`parseGatewayFeeSchedule`): faixas contíguas, sem sobreposição, começando em 1 e
terminando em 12; bps entre 0 e 2.000; centavos inteiros não negativos. Chave ausente ou inválida
não quebra a tela: o bloco mostra "não cadastrado" e o modal mostra só o efetivo da venda.

Ao lado de cada taxa, a coluna **"Medido nas vendas (90 dias)"**, vinda da RPC nova
`gateway_fee_measured(p_days int default 90)`:

- `SECURITY DEFINER`, só `hub_admin` (os demais recebem `42501`), `revoke` nominal de `anon` e
  `authenticated` antes do `grant` (default privileges do Supabase).
- Lê o **último** evento `payables` de cada pagamento pago ou estornado da Pagar.me no período, só
  recebíveis de crédito, e devolve **somas** por método e número de parcelas: `sales`,
  `charged_cents`, `fee_cents` e `fraud_cents`. A taxa por faixa (`sum(fee) / sum(valor cobrado)`)
  é calculada no front (`measuredForBand`), porque as faixas são configuração: se a RPC dividisse
  por faixa, mudar uma faixa no Manager exigiria mudar a função. Antecipação: `payables`,
  `fee_cents`, `base_cents_month` (líquido do recebível vezes dias corridos entre `payment_date` e
  `original_payment_date`, sobre 30) e `monthly_bps`, só dos recebíveis antecipados.
- Faixa sem venda no período devolve contagem zero e a tela mostra "sem venda".
- Diferença acima de 0,05 ponto percentual entre medido e cadastrado ganha destaque na linha.

## Casos que o modal trata

| Caso | O que aparece |
|---|---|
| Pix | Sem bloco de parcelas; uma linha "Pix (Pagar.me)" |
| Taxa ainda não apurada (`gateway_fee_cents` nulo) | "apurando", e o botão "Ver taxas" continua abrindo |
| Pagamento sem evento `payables` no rastro (venda antiga) | Só o total da taxa, com a nota "sem detalhe por parcela" |
| Cartão sem antecipação ainda (antes da releitura de ~D+31) | Linha de antecipação "ainda não antecipado"; datas de entrada = datas originais |
| Venda sem split (`split_sent_to_gateway = false`) | Etiqueta "sem split: o valor ficou com a Movepark" no resumo |
| Estorno | Recebíveis de `refund` ficam fora da conta da venda (como em `totalGatewayFeeCents`); o resumo cita o valor estornado |
| Reserva do white-label | Sem botão: o pagamento não passou pela Pagar.me do Hub |
| Reserva sem pagamento pago | Sem botão |

## Arquitetura

- **Lógica pura** em dois arquivos (a tela só desenha):
  - `src/lib/gatewayFees.ts`, usado pela tela de Configurações e pelo modal:
    `parseGatewayFeeSchedule`, `validateGatewayFeeSchedule`, `bandFor`, `measuredForBand`,
    `measuredAntifraudCents`, `differsFromContract` (tolerância de 5 bps), `formatBps` e
    `parseHundredths`;
  - `src/features/bookings/bookingFees.logic.ts`: `parsePayables(raw)` (o único que conhece o
    formato da Pagar.me; mapeia para o formato do `GatewayPayable` do `_shared` mais
    `originalPaymentDate`, só crédito), `latestPayables(events, paymentId)` e
    `buildFeeDetail({ money, payment, booking, payables, schedule, policy, moveparkRecipientId })`,
    que devolve resumo, linhas de taxa, parcelas, plano de parcelamento e os avisos. A perna da
    antecipação é separada pelo recebedor da Movepark (`app_setting.pagarme_movepark_recipient_id`).
- **Componentes:** `BookingFeesDialog.tsx` (o modal, `Dialog` do shadcn). O `BookingMoneyCard`
  recebe `onShowFees` e só desenha o botão quando recebe; quem decide é o `BookingDetailView`:
  audiência `manager`, `effectiveRole === "hub_admin"` (só ele lê o rastro) e pagamento pago ou
  estornado. O modal só monta ao abrir. Dados: `useBookingGatewayTrail`, `useAppSettings` e o
  booking. Reserva do white-label não passa por esta tela, então não tem botão.
- **Configurações:** `src/features/settings/GatewayFeeScheduleSettings.tsx`, encaixado na aba
  Pagamentos de `src/routes/manager/settings.tsx`, gravando pelo `useUpdateAppSettings` que já
  existe; hook `useGatewayFeeMeasured` em `src/features/settings/api.ts` (cast localizado, mesmo
  padrão de `useBookingGatewayTrail`).
- **Banco:** uma migration só, com a RPC `gateway_fee_measured`. Nenhum valor de taxa vai na
  migration. Depois: `bun run gen:types`.
- **Gateway:** nada muda. Nenhuma chamada nova à Pagar.me; tudo sai do rastro já gravado
  (ADR-004: a lógica lê recebíveis no formato da interface, não do Pagar.me cru, exceto no parser).

## Testes

- **Vitest, lógica** (`bookingFees.logic.test.ts`), com fixture **sintética** (taxas inventadas,
  nunca as do contrato):
  - a soma das linhas da Pagar.me é igual ao `gateway_fee_cents` do pagamento;
  - parcelas somadas entre os dois recebedores, com o resto de centavos na primeira;
  - recebível de `refund` fora da conta;
  - Pix sem parcelas; taxa pendente; pagamento sem `payables`; venda sem split;
  - aviso "diferente do contrato" acima de 0,05 p.p. e silêncio abaixo;
  - "condição da época da compra" quando a política de hoje não reproduz o valor cobrado.
- **Vitest, componente:** o modal desenha os quatro blocos para cartão, esconde parcelas no Pix, e
  o botão não existe para o balcão (Operator sem `finance:read`) nem para reserva sem pagamento; o
  formulário recusa faixa com buraco ou sobreposição.
- **pgTAP** (`gateway_fee_measured.test.sql`): `hub_admin` lê; `authenticated` comum e operador
  recebem `42501`; `anon` não executa; o MDR medido sai do último evento `payables` e ignora
  recebível de `refund`.

## A tabela no Operator, para o estacionamento (23/11/2026)

Atividade [Hub: tabela de taxas da Pagar.me fixa no dashboard admin](https://app.clickup.com/t/17tn9ea4359):
o estacionamento abre o painel e encontra as taxas vigentes, sem precisar perguntar. Card
**"Entenda as nossas taxas"** no Financeiro do Operator (`/operator/finance`, escopo `finance:read`:
Dono, Gerente e Financeiro), logo abaixo de "Vendas que você traz".

- **Quem paga o quê, por canal:** uma linha para "Vendas pela Movepark" (comissão da empresa,
  padrões do Hub) e uma por regra de origem ativa da empresa, com comissão, quem paga a taxa do
  cartão e do Pix e quem paga a antecipação (a mesma precedência de `resolve_commission`: regra,
  empresa, padrão do Hub).
- **Cartão, de 1x a 12x:** taxa do cartão (faixa do contrato), antecipação (custo em 30 dias menos a
  taxa do cartão; à vista é zero) e total para receber em 30 dias (`cet30_bps`).
- **Pix** (o dinheiro entra na hora) e **saque manual** (o repasse automático do mês não tem custo).
- **Antifraude só se as vendas pagaram de fato** (decisão do Kallef em 23/11/2026): aparece quando
  algum recebível dos últimos 90 dias trouxe `fraud_coverage_fee` maior que zero. O gateway por
  transação (`processing_cents`) nunca aparece para o estacionamento, porque não vem nos recebíveis.
- **Parcelamento do cliente:** a política da plataforma com o override do canal ou da empresa
  (`applyInstallmentOverride`), mais a nota de que a condição é ajustada por canal com a Movepark.

Dados pela RPC `partner_fee_table(p_company_id)` (`SECURITY DEFINER`, `hub_admin` ou
`member_has_scope(company, 'finance:read')`, `42501` para os demais), porque `gateway_fee_schedule` e
a política de parcelamento são `is_public = false`. Ela devolve a tabela contratada sem o gateway por
transação, a taxa de antecipação ao mês, a taxa de saque, a política de parcelamento e os canais da
empresa. Lógica de tela em `src/features/commission/partnerFees.logic.ts`; card em
`PartnerFeesCard.tsx`.

## "Ver taxas" na reserva do Operator (24/11/2026)

O estacionamento abre a reserva no Operator e tem o mesmo botão **"Ver taxas"** no card Valores,
para conferir cada venda sem perguntar. Aparece para quem tem `finance:read` na empresa (Dono,
Gerente, Financeiro) e só com pagamento pago ou estornado; o balcão (papel Operação) não vê
dinheiro e não tem o botão.

O modal é o mesmo do Manager, com a parte do estacionamento:

- **Resumo:** o que o cliente pagou e "Você recebe" (ou "A repassar" sem split). O que a Movepark
  fica com não aparece.
- **Taxas:** as mesmas linhas, com "quem paga: você" e a antecipação dividida em "você" e
  "Movepark". A taxa do cartão aparece como o efetivo da venda; a comparação com o contrato e o
  aviso "diferente do contrato" são conferência interna e ficam só no Manager, assim como o aviso de
  recebíveis desatualizados.
- **Tabela:** a mesma do Financeiro (`partner_fee_table`): sem o gateway por transação, e com o
  antifraude só quando as vendas pagam. "Contrato para receber em 30 dias" vira "tabela para receber
  em 30 dias".

O estacionamento não lê o rastro do gateway (`payment_gateway_event` é só de `hub_admin`) nem a
tabela em `app_setting`. Os recebíveis vêm da RPC `partner_booking_payables(p_booking_id)`
(`SECURITY DEFINER`, `hub_admin` ou `finance:read` na empresa da reserva; `42501` para os demais e
também para reserva que não existe). Ela devolve, por pagamento, só o último evento `payables` que
trouxe recebível, e de cada recebível só os campos da conta. O recebedor sai como `movepark` ou
`partner`, nunca o id na Pagar.me, e o resto do evento (requisição, ids do gateway) não sai. No
front, `partnerPayables` converte para o formato da conta e `buildFeeDetail` roda igual ao do
Manager. Migration `20261206160000_partner_booking_payables.sql`, pgTAP
`partner_booking_payables.test.sql`.

**Antes de a Pagar.me informar a taxa (MP-89AC91, 24/11/2026).** O cron lê os recebíveis a cada 30
minutos, com 10 de atraso, e a reserva do Operator não pedia a apuração: uma venda de Pix paga às
8h56 mostrava "apurando" no Pix, no antifraude e no total até a volta do cron. Mudou:

- O Operator com `finance:read` pede a apuração ao abrir a reserva, como o Manager
  (`reconcile-gateway-fees` aceita, na porta do JWT, `hub_admin` ou `finance:read` na empresa da
  reserva). A taxa costuma existir segundos depois do pagamento.
- Enquanto não chega, o valor diz **"a confirmar"**, a linha diz "a Pagar.me ainda não informou" e o
  resumo avisa que a taxa ainda vai ser descontada quando ela é do estacionamento. "Sem detalhe por
  parcela" ficou só para cartão.
- Pix não tem antifraude: a linha não aparece no Pix, em nenhuma das visões. No Operator, o
  antifraude do cartão só aparece quando a venda pagou.

**À vista não fala em antecipação (MP-784999, 24/11/2026).** A linha de antecipação só existe no
cartão parcelado (ou se o recebível trouxer taxa de antecipação). As 11 vendas à vista de 15 a
23/11/2026 que nasceram com cessão (`anticipation_comp_cents`) mostram a cessão como linha própria
(`key: "cession"`): "Ajuste a seu favor" no Operator, "Cessão ao estacionamento" no Manager, quem
paga Movepark. Ver [antecipacao-do-parceiro.md](./antecipacao-do-parceiro.md).

## Fora de escopo

- O texto para mandar ao parceiro fora do painel.
- Mudar a política de parcelamento, a comissão ou quem paga cada taxa: esta entrega só mostra.
- Histórico de versões da tabela de taxas (o que valia em cada data). Se precisar, vira tabela
  própria depois; por ora a tabela é a vigente e o modal compara com o efetivo da venda.
