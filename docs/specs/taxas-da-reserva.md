# Taxas da reserva e tabela de taxas (Manager)

**Origem:** a Pare Seguro viu descontos nas vendas online e não entendia de onde vinham (reunião de
11/11/2026, atividade [Enviar tabela detalhada das taxas da Pagar.me](https://app.clickup.com/t/17tn9ea0amp)).
Em 23/11/2026 ficou decidido que, antes de mandar qualquer tabela para fora, a explicação nasce
**dentro do Manager**, para a equipe conferir o que vai aparecer. A visão do estacionamento
(Operator) é uma etapa posterior e não faz parte desta spec.
**Estado:** desenho aprovado em 23/11/2026, implementação não iniciada.
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
| 1 | Onde aparece primeiro | **Manager**, na reserva. Operator fica para depois |
| 2 | Como abre | Botão **"Ver taxas"** no card Valores, que abre um modal |
| 3 | De onde vem a tabela de taxas da Pagar.me | **Cadastrada no Manager**, com o valor **medido nas vendas** ao lado de cada taxa para mostrar divergência |
| 4 | Onde mais a tabela fica | Também em **Configurações › Pagamentos**, junto da política de parcelamento e da comissão padrão |
| 5 | Onde mora o número | **Só no banco** (`app_setting`, `is_public = false`). O repositório é público e a proposta comercial da Pagar.me tem sigilo: nenhuma taxa contratada entra em migration, seed, teste ou doc |

## O modal "Taxas da reserva"

Abre pelo botão "Ver taxas" no card Valores, só na audiência `manager`. Quatro blocos, nesta ordem:

1. **Resumo.** Três números: o que o cliente pagou (com "Nx de R$ Y" no cartão), o que o
   estacionamento recebe e com quanto a Movepark fica depois das taxas. Os três saem de
   `buildMoneyBreakdown`, a mesma conta do card Valores, para o modal nunca discordar do card.
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
     "diferente do contrato". Quem paga: `commission_fee_payer`.
   - **Antecipação (Pagar.me):** soma do `anticipation_fee`, separada por perna (estacionamento e
     Movepark) e com a data em que o dinheiro entrou. Quem paga: `commission_anticipation_payer`;
     quando é a Movepark, a linha diz quanto ela devolveu ao estacionamento
     (`payment.anticipation_credit_cents`). Sem antecipação ainda, a linha diz "ainda não
     antecipado".
   - **Antifraude (Pagar.me):** soma do `fraud_coverage_fee`.
   - **Total do gateway:** soma das três linhas da Pagar.me. Tem que bater com
     `payment.gateway_fee_cents`; se não bater, o modal mostra os dois números e o aviso
     "recebíveis desatualizados", em vez de esconder a diferença.
3. **Parcelas** (só cartão). Uma linha por parcela: valor que o cliente vê na fatura, data
   original de vencimento, data em que o dinheiro entrou (`payment_date`, quando houve
   antecipação) e as taxas daquela parcela somadas entre os recebedores (MDR e antecipação). O
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
  "antifraud_cents": 0
}
```

Os zeros acima são só a forma: os valores reais são digitados no Manager. Validação no formulário
e na leitura (`parseGatewayFeeSchedule`): faixas contíguas, sem sobreposição, começando em 1 e
terminando em 12; bps entre 0 e 2.000; centavos inteiros não negativos. Chave ausente ou inválida
não quebra a tela: o bloco mostra "não cadastrado" e o modal mostra só o efetivo da venda.

Ao lado de cada taxa, a coluna **"Medido nas vendas (90 dias)"**, vinda da RPC nova
`gateway_fee_measured(p_days int default 90)`:

- `SECURITY DEFINER`, só `hub_admin` (os demais recebem `42501`), `revoke` nominal de `anon` e
  `authenticated` antes do `grant` (default privileges do Supabase).
- Lê o **último** evento `payables` de cada pagamento pago ou estornado da Pagar.me no período, só
  recebíveis de crédito, e devolve por método e faixa de parcelas: quantidade de vendas, MDR
  efetivo (`sum(fee) / sum(valor cobrado)`) e antifraude médio. Antecipação: taxa efetiva ao mês
  sobre o líquido, proporcional aos dias corridos entre `payment_date` e `original_payment_date`,
  só dos recebíveis antecipados.
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

- **Lógica pura** em `src/features/bookings/bookingFees.logic.ts`:
  - `parsePayables(raw)`, que lê o `response.data` do evento e mapeia para o mesmo formato do
    `GatewayPayable` do `_shared` mais `originalPaymentDate`, ignorando o que não for crédito;
  - `buildFeeDetail({ payment, booking, payables, schedule, policy })`, que devolve resumo, linhas
    de taxa, parcelas, plano de parcelamento e os avisos (diferente do contrato, recebíveis
    desatualizados, condição da época);
  - `parseGatewayFeeSchedule(raw)` e `bandFor(schedule, installments)`.
  A tela só desenha.
- **Componentes:** `BookingFeesDialog.tsx` (o modal, `Dialog` do shadcn) e o botão no
  `BookingMoneyCard` quando `audience === "manager"`. Dados: `useBookingGatewayTrail` (já carregado
  na tela), `useAppSettings` (já existe) e o booking.
- **Configurações:** bloco `GatewayFeeScheduleForm` na aba Pagamentos de `src/routes/manager/settings.tsx`,
  gravando pelo `useUpdateAppSettings` que já existe; hook `useGatewayFeeMeasured` em
  `src/features/settings/api.ts`.
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
  o botão não existe para o Operator nem para reserva sem pagamento; o formulário recusa faixa com
  buraco ou sobreposição.
- **pgTAP** (`gateway_fee_measured.test.sql`): `hub_admin` lê; `authenticated` comum e operador
  recebem `42501`; `anon` não executa; o MDR medido sai do último evento `payables` e ignora
  recebível de `refund`.

## Fora de escopo

- Visão do estacionamento (Operator) e texto para mandar ao parceiro: próxima etapa, depois de a
  equipe conferir o modal.
- Mudar a política de parcelamento, a comissão ou quem paga cada taxa: esta entrega só mostra.
- Histórico de versões da tabela de taxas (o que valia em cada data). Se precisar, vira tabela
  própria depois; por ora a tabela é a vigente e o modal compara com o efetivo da venda.
