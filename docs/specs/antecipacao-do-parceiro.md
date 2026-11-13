# Antecipação do cartão do parceiro (receber tudo em 30 dias)

**Épico:** E0.3.14 (continuação de [repasse-automatico-mensal.md](./repasse-automatico-mensal.md) e
[comissao-por-origem.md](./comissao-por-origem.md)).
**Estado:** desenhado em 13/11/2026 com o Kallef, em conversa (AskUserQuestion + mensagens). Falta a
revisão desta spec e o plano de implementação.

## O problema, medido

Em 13/11/2026 os recebíveis das cinco vendas de 3x com mais de 30 dias foram relidos na Pagar.me
(`GET /payables`):

- A parte da **Movepark** (recebedor master `re_cms5cvguc2l2r0l9tncrmgrsm`) foi **antecipada
  inteira** um dia útil antes da 1ª parcela, com `bulk_anticipation_id` e `anticipation_fee` em
  cada parcela. Taxa efetiva medida: **3,1% ao mês sobre o líquido da parcela, proporcional aos dias
  corridos**, igual aos 3,11% contratados.
- A parte do **parceiro** **não é antecipada**: cada parcela cai na data original (D+30, D+60,
  D+90). Todos os recebedores de parceiro foram criados pela nossa API com
  `automatic_anticipation_settings = { enabled: false, volume_percentage: 0, delay: 365 }`, porque o
  padrão do Hub (`app_setting.payout_anticipation_enabled`) é `false`.

A minuta do contrato do parceiro promete o valor inteiro liberado em 30 dias (cláusula 4.1) e o
repasse sobre o preço base, seja qual for a forma de pagamento (3.3). Com o cartão parcelado isso
não acontece hoje: o "liberado" da nossa conta do parceiro fica maior que o saldo real na Pagar.me.

Condições vigentes (painel "Taxas e prazos" + proposta atual): crédito à vista 3,79%, parcelado
4,69%, **antecipação automática 3,11% ao mês**, CET para receber em 30 dias: à vista 3,79%, 2x
6,34%, 3x 7,82%, 6x 12,27%, 12x 21,16%.

## Restrições do gateway (não mudam)

1. **A taxa de antecipação sai sempre do saldo do recebedor antecipado.** A regra de split da Core
   v5 só tem `liable`, `charge_processing_fee` e `charge_remainder_fee`; não há campo para a taxa de
   antecipação. Transferência entre recebedores não existe (custódia descartada em 15/09/2026).
2. **A antecipação só existe depois do pagamento**, sobre a agenda de recebíveis. Nunca na criação
   da order. Dois modos: **automática** (`PATCH /recipients/{id}/automatic-anticipation-settings`,
   a Pagar.me executa sozinha) e **pontual** (`POST /recipients/{id}/bulk_anticipations`, aprovada
   uma vez por dia às 11h e paga por volta das 14h; o mais cedo é o dia útil seguinte).
3. **A antecipação é por recebedor, não por venda.** Ligada, vale para todo o cartão daquele
   parceiro.
4. **A pontual não escolhe venda.** Pede-se um valor líquido e um `timeframe` (`start` = recebíveis
   mais próximos, `end` = mais distantes).

## Decisões

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Quem paga a antecipação da parte do parceiro | **Configurável**: padrão no **repasse da empresa** (Manager) e sobreposição nas **regras de origem** (como a da Pare Seguro). Congelado na reserva |
| 2 | Padrão | **Movepark paga** (`app_setting.commission_default_anticipation_payer = 'movepark'`). O parceiro só paga quando a Movepark decidir no Manager |
| 3 | Como a Movepark paga, se o gateway desconta do parceiro | **Ajuste no split da venda**: a perna do parceiro recebe, na cobrança, a estimativa da taxa com folga, tirada da perna da Movepark. O parceiro nunca recebe menos que o prometido |
| 4 | Liga para todos ou empresa a empresa | **Desligada por padrão; liga empresa a empresa no Manager.** Desligada, nada muda: o parceiro recebe mês a mês e ninguém paga taxa |
| 5 | Prazo | **30 dias**, o mesmo modelo que já vale no recebedor da Movepark e o da tabela de CET contratada |
| 6 | Vendas já feitas | Botão **"Antecipar agora"** no repasse da empresa: antecipação pontual com simulação do custo antes de confirmar. Se quem paga é a Movepark, a taxa volta ao parceiro como crédito na próxima venda |

## Modelo de dados

### Configuração

| Onde | Coluna / chave | Conteúdo |
|---|---|---|
| `payout_recipient` (já existe) | `anticipation_enabled`, `anticipation_type`, `anticipation_volume_percentage`, `anticipation_delay` | Espelho do que está no recebedor do gateway. Ligar = `enabled true`, `type full`, `volume 100`, `delay` igual ao do recebedor da Movepark (gate G2) |
| `company` | `anticipation_fee_payer` text null | `movepark` / `partner`. Nulo herda o padrão. Escrita só pela RPC `set_company_anticipation` (hub_admin), que também aciona o ligar/desligar |
| `commission_rule` | `anticipation_fee_payer` text null | Nulo herda a empresa. `CHECK` em (`movepark`, `partner`) |
| `app_setting` | `commission_default_anticipation_payer` = `movepark` | Padrão do Hub |
| `app_setting` | `card_anticipation_rate_monthly_bps` = `311` | Taxa contratada, usada só na estimativa |
| `app_setting` | `card_anticipation_margin_days` = `4` | Folga em dias por parcela na estimativa |

### Congelado na reserva

`booking.commission_anticipation_payer` (`movepark` / `partner`), resolvido por `resolve_commission`
na criação (regra > empresa > padrão), junto com o resto do pacote. Reserva anterior lê como
`movepark`. A trava de PATCH do cliente nas colunas `commission_*` cobre a nova coluna.

### Na cobrança

| Coluna em `payment` | Conteúdo |
|---|---|
| `anticipation_comp_cents` int null | Quanto a perna da Movepark cedeu à do parceiro para cobrir a antecipação. Nulo = não se aplicou |
| `anticipation_fee_partner_cents` int null | Taxa de antecipação real na perna do parceiro, apurada na releitura |
| `anticipation_fee_movepark_cents` int null | Idem na perna da Movepark |
| `anticipation_reread_at` timestamptz null | Quando os recebíveis foram relidos depois da antecipação |

### Antecipação pontual

Tabela `payout_anticipation`: `id`, `company_id`, `provider`, `external_id` (`ba_...`),
`requested_cents`, `amount_cents`, `anticipation_fee_cents`, `fee_cents`, `timeframe`, `status`
(`pending`, `pre_approved`, `approved`, `refused`, `canceled`), `fee_borne_by` (`movepark` /
`partner`, congelado no pedido a partir do padrão da empresa), `payment_date`, `created_by`,
`created_at`, `updated_at`. RLS: leitura e escrita só `hub_admin`; o parceiro vê pela conta dele
(RPC).

## Estimativa da compensação

Função pura `estimateAnticipationCompCents` em `_shared/payments/anticipation.ts` (com teste Deno),
chamada por `buildSplit` quando **todas** as condições valem: método cartão, recebedor do parceiro
com antecipação ligada, `commission_anticipation_payer = movepark`.

Para `n` parcelas, perna do parceiro `L` e MDR na perna dele `m` (zero quando a Movepark paga o
MDR):

- dias antecipados da parcela `i` (1 a `n`): `d_i = 30 × (i − 1) + margem` (margem = 4);
- fator `f = (taxa_mensal / 30) × Σ d_i / n`;
- compensação `δ = ceil( f × (L − m) / (1 − f) )`.

Exemplo: 3x, perna do parceiro de R$ 120,00 com MDR pago pela Movepark: `Σ d = 4 + 34 + 64 = 102`,
`f = 0,0311 / 30 × 102 / 3 = 3,52%`, `δ = R$ 4,39`. Com a antecipação real (uns 2, 32 e 62 dias),
a taxa sobre os R$ 124,39 fica em torno de R$ 4,13, e o parceiro termina com uns R$ 0,26 a mais
que os R$ 120,00: é a folga que a Movepark paga.

Limites: a perna da Movepark nunca fica abaixo de R$ 1,00 nem da taxa estimada do MDR quando ela
paga o MDR (regras que já existem). O que não couber vira **crédito** na próxima venda (mesmo
trilho do crédito da taxa de repasse). A ordem no split é: comissão, abatimento de dívida, crédito
de taxa, compensação de antecipação.

## Releitura depois da antecipação

Hoje `reconcile-gateway-fees` lê os recebíveis uma vez, logo depois do pagamento, antes da
antecipação (que acontece por volta de D+29). Passa a reler **uma vez** cada cobrança de cartão
paga há mais de 31 dias com `anticipation_reread_at` nulo:

- grava `gateway_fee_cents` com o total real (MDR + antecipação) e as duas colunas de antecipação
  por perna;
- **acerto**: se a taxa real do parceiro passou de `anticipation_comp_cents` (a folga não bastou), a
  diferença entra no crédito do parceiro. Se sobrou, fica com o parceiro (custo aceito da folga).

## Crédito do parceiro (generalizado)

`payout_fee_credit_cents(company)` passa a somar como "gerado", além dos saques com taxa da
Movepark:

1. a taxa das antecipações pontuais com `fee_borne_by = movepark` e status `approved`;
2. a falta apurada na releitura (taxa real do parceiro − compensação, quando positiva, em venda
   com pagador `movepark`).

A devolução segue igual: `fee_credit_returned_cents` no split da próxima venda.

## Telas

- **Manager › Recebedores › Repasse** (`PayoutSettingsDialog`): seção "Cartão em 30 dias" com o
  interruptor (liga a antecipação automática no recebedor pela Edge `update-recipient-payout`) e
  "Quem paga a antecipação" (herdar / Movepark / parceiro). Mostra o custo de referência (3x =
  7,82% contra 4,69% sem antecipar).
- **Manager › Comissões** (`CommissionRulesCard`): campo "Antecipação paga por" (herdar / Movepark /
  parceiro) na regra, e coluna na tabela.
- **Botão "Antecipar agora"** no repasse da empresa: mostra o máximo antecipável (`limits`), simula
  o valor pedido (`simulate`, `timeframe start`) com custo e data, e só cria depois da confirmação.
  Lista as antecipações pontuais da empresa com status.
- **Reserva no Manager** (card "Canal da venda"): quem pagou a antecipação, a compensação enviada e
  a taxa real depois da releitura.
- **Conta do parceiro** (Manager e Operator): linha "Antecipação" no extrato. Paga pela Movepark,
  aparece como informativo, sem desconto; paga pelo parceiro, aparece descontada.

## Gateway (ADR-004)

Interface `PaymentGateway` ganha `getAnticipationLimits`, `simulateAnticipation`,
`createAnticipation` e `listAnticipations` (adapter Pagar.me + mock). `updateAnticipationSettings`
já existe. Edge nova `recipient-anticipation` (hub_admin): `{ company_id, action: limits | simulate
| create, requested_cents?, timeframe? }`. O status da pontual é conciliado por cron (a cada hora
entre 11h e 15h BRT) até `approved`/`refused`. Todo pedido grava `payment_gateway_event` (rastro
visível, regra de 11/09/2026).

## Gates (abrir antes de codar a parte correspondente)

| # | Pergunta | Como fechar |
|---|---|---|
| G1 | A Pagar.me aceita ligar a antecipação automática num recebedor de parceiro pela API, ou exige liberação do relacionamento? | `PATCH` no recebedor da Agência Fera (empresa nossa), lendo a resposta |
| G2 | Qual `delay`/`type` está no recebedor da Movepark (para copiar o modelo de 30 dias)? | `GET /recipients/re_cms5cvguc2l2r0l9tncrmgrsm` |
| G3 | Ligar a automática pega recebíveis já existentes ou só vendas novas? | Ligar na Agência Fera com recebível pendente e reler no dia seguinte |
| G4 | No estorno de parcela já antecipada, a taxa de antecipação volta? | Medir no primeiro estorno de cartão antecipado; até lá o razão não presume devolução |

## Testes

- Deno: `anticipation.test.ts` (estimativa: 1x, 3x, 12x, MDR do parceiro, folga, arredondamento
  para cima), `split.test.ts` (compensação depois do crédito, piso de R$ 1,00, sobra virando
  crédito, sem compensação com pagador `partner` ou recebedor desligado, soma == cobrado), branch da
  Edge `recipient-anticipation` (não hub_admin, simulação, criação, erro do gateway).
- pgTAP: resolução do pagador (regra > empresa > padrão), trava do PATCH do cliente,
  `set_company_anticipation` só hub_admin, crédito generalizado (pontual Movepark, falta da
  releitura, devolução), RLS de `payout_anticipation`.
- Vitest: interruptor e pagador no `PayoutSettingsDialog`, campo na regra, linha no extrato, card
  da reserva.

## Fora do escopo

- Antecipação no dia seguinte à venda (custa o dobro: ~6,2% da parte antecipada num 3x).
- Antecipação pedida pelo próprio parceiro no Operator.
- Mudar o texto do contrato: a minuta 4.1 já promete 30 dias.
