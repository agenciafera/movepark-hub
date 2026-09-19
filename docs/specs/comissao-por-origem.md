# Comissão por origem da venda (E0.3.12)

> Status: **implementado em 18/09/2026 (fases 1 a 7 e 9). Falta a fase 8: as compras reais do
> roteiro de validação, que dependem de um cliente pagando.** A regra de teste da Agência Fera já
> está cadastrada em produção (`utm_source = agenciafera`, 10%, taxa por conta do parceiro).
> Decisões tomadas pelo Kallef em conversa, registradas na seção "Decisões".
> Specs relacionadas: [payment-split.md](./payment-split.md),
> [split-dinamico-e-divida-do-parceiro.md](./split-dinamico-e-divida-do-parceiro.md),
> [estorno-hibrido.md](./estorno-hibrido.md), [conta-do-parceiro.md](./conta-do-parceiro.md).

## O problema

A Movepark cobra uma comissão única por empresa (`company.take_rate_bps`, 20% em todas hoje). Há
estacionamento que vai vender pelo Hub trazendo o próprio cliente: link no site dele, anúncio
pago por ele, rede social dele. Cobrar dessa venda os mesmos 20% de uma venda que a Movepark
trouxe (Google, campanha nossa, busca do Hub) é injusto e desestimula o parceiro a investir.

O "afiliado" é o próprio estacionamento. Ele continua recebendo pelo split da Pagar.me, na conta
da Movepark, como hoje. O que muda por origem é um **pacote**: a comissão, quem paga a taxa do
gateway e quem arca com chargeback. Não existe afiliado terceiro neste épico.

## Decisões

| # | Pergunta | Decisão |
|---|---|---|
| 1 | O que identifica a venda trazida pelo parceiro | `utm_source` com valor **cadastrado para a empresa** no Manager. Venda pelo site white-label da empresa conta sozinha, sem UTM |
| 2 | Cliente tocou nos dois lados | **Último clique, janela de 7 dias** |
| 3 | Quem define os valores | **Tudo configurável pela Movepark**: quais UTMs, qual comissão, quem paga a taxa do gateway, quem arca com chargeback. Regra global como padrão, regra por empresa como exceção. Nenhum pacote fixo em código |
| 4 | Quantos canais | Quantas regras a Movepark cadastrar. Sem regra que case, vale o padrão do Hub |
| 5 | Chargeback configurável | Três opções por regra: **cada um com a sua parte** (hoje), **tudo do parceiro**, **tudo da Movepark**. No gateway o `liable` segue no master; a regra decide o acerto no razão |
| 6 | Quando a regra é decidida | **Na criação da reserva**, e fica congelada nela |
| 7 | Afiliado terceiro | **Fora.** Não existe neste épico |

Risco aceito na decisão 1: UTM é texto na URL e qualquer pessoa escreve. Mitigações que fazem
parte do desenho: o valor precisa estar cadastrado para a empresa, só reduz comissão em unidade
**daquela** empresa, a reserva guarda a prova da origem, o Manager corrige o canal de uma reserva
com auditoria, e há alerta de concentração anormal no canal do parceiro.

## Modelo de dados

### `commission_rule`

Uma linha por regra. `company_id` nulo = regra global.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `company_id` | uuid null | FK `company`. Nulo = vale para todas as empresas |
| `name` | text | Rótulo que aparece nas telas ("Site do parceiro", "Anúncios da Virapark") |
| `utm_sources` | text[] | Valores aceitos, normalizados (minúsculas, sem espaço nas pontas). Pode ser vazio se a regra for só de white-label |
| `match_white_label` | boolean | Casa venda cuja origem é o site white-label da empresa |
| `take_rate_bps` | integer | Comissão da Movepark nesta origem, 0 a 10000 |
| `gateway_fee_payer` | text | `movepark` ou `partner` |
| `chargeback_bearer` | text | `each` (cada um com a sua parte), `partner`, `movepark` |
| `priority` | integer | Desempate quando duas regras casam; maior vence |
| `is_active` | boolean | |
| `valid_from`, `valid_until` | timestamptz null | Vigência opcional |
| `created_by`, `created_at`, `updated_at`, `deleted_at` | | Convenção do schema |

Restrições: `gateway_fee_payer` e `chargeback_bearer` por `CHECK`; regra global não pode ter
`match_white_label` (white-label é sempre de uma empresa); um mesmo `utm_source` não pode estar
ativo em duas regras da mesma empresa (índice único parcial sobre o valor desaninhado, ou trigger).
RLS: leitura e escrita só `hub_admin`. O parceiro não lê a tabela; ele vê a regra aplicada pela
reserva.

### Padrão do Hub

Não é linha da tabela. É o comportamento de hoje, e é o que vale quando nenhuma regra casa:
comissão = `company.take_rate_bps`, `gateway_fee_payer = movepark`, `chargeback_bearer = each`.
Os dois últimos ficam em `app_setting` (`commission_default_fee_payer`,
`commission_default_chargeback_bearer`) para a Movepark poder mudar sem deploy.

### Congelado na reserva (`booking`)

| Coluna | Conteúdo |
|---|---|
| `commission_rule_id` | Regra aplicada, ou nulo no padrão do Hub |
| `commission_channel` | Rótulo congelado (`hub` ou o `name` da regra) |
| `commission_take_rate_bps` | Comissão aplicada |
| `commission_fee_payer` | `movepark` ou `partner` |
| `commission_chargeback_bearer` | `each`, `partner` ou `movepark` |
| `attribution` | jsonb com a prova: `utm_source`, `utm_medium`, `utm_campaign`, `clicked_at`, `landing_url`, `referrer`, `origin` |

Reserva anterior ao épico fica com as colunas nulas e é lida como padrão do Hub.

### Correção manual

`booking_commission_override` (histórico): `booking_id`, de qual pacote para qual, `reason`,
`changed_by`, `created_at`. A RPC `admin_set_booking_commission` (só `hub_admin`) grava o
histórico e atualiza as colunas congeladas, e **recusa** reserva que já tem pagamento pago: depois
de cobrado, o split já foi ao gateway e a correção é financeira, por fora.

## Resolução da regra

Função SQL `resolve_commission(p_location_id, p_attribution jsonb)`, chamada na criação da
reserva (server-authoritative; o navegador só informa a atribuição):

1. Descobre a empresa da unidade.
2. Candidatas: regras ativas, dentro da vigência, da **empresa** ou **globais**, que casem por
   `utm_source` (valor normalizado presente em `utm_sources`, com `clicked_at` dentro de 7 dias)
   ou por `match_white_label` quando a origem é o white-label da empresa.
3. Ordena por: regra da empresa antes de global, depois `priority` decrescente, depois a mais
   recente. Pega a primeira.
4. Sem candidata: padrão do Hub.

Regra global com `utm_sources` serve para origem que não é de um parceiro só (ex.: um parceiro de
mídia da própria Movepark com comissão diferente). UTM cadastrado na empresa A nunca casa em
unidade da empresa B, porque o passo 2 só olha regras da empresa da unidade e as globais.

## Atribuição (último clique, 7 dias)

Hoje `src/lib/utm.ts` guarda o último UTM em `sessionStorage`, só durante a visita, e a Edge
`create-booking` grava `utm_*` na reserva depois de criá-la. Muda:

- O armazenamento vai para `localStorage` com `clicked_at`, `landing_url` e `referrer`, e expira
  em 7 dias. Último clique sobrescreve.
- Chegada **sem** UTM não apaga o que está guardado (o cliente que clicou no link do parceiro
  ontem e hoje digita o endereço continua sendo do parceiro, até vencer a janela).
- Chegada com UTM **da Movepark** (campanha nossa) sobrescreve, como qualquer último clique.
- `create-booking` recebe o objeto de atribuição, valida o formato, chama `resolve_commission` e
  grava o pacote congelado na mesma transação da reserva. `utm_source/medium/campaign` seguem
  sendo gravados nas colunas que já existem, para a tela de Atribuição.
- White-label: a origem já chega distinta (`origin`); a regra casa por `match_white_label`.
- A Public API e o MCP (agente de WhatsApp) criam reserva sem navegador: entram no padrão do Hub,
  salvo regra global futura por `origin`. Fora do primeiro corte.

## Cobrança

`create-pix-charge` e `create-card-charge` passam a ler o pacote da reserva:

- `takeRateBps` = `booking.commission_take_rate_bps` (nulo = `company.take_rate_bps`).
- `buildSplit` ganha `feePayer`. `partner` marca `charge_processing_fee` e
  `charge_remainder_fee` na perna dele; `movepark` na perna da Movepark, com a exceção de
  segurança que já existe (perna da Movepark menor que a taxa estimada devolve a taxa ao parceiro).
- Tudo que depende de quem pagou a taxa (extrato, dívida, estorno híbrido, piso do abatimento,
  tela de valores) já lê a flag gravada em `payment.split`, então acompanha sem mudança.
- Comissão 0% é válida: sem perna da Movepark, o parceiro fica `liable` e paga a taxa, como o
  `buildSplit` já faz.

## Chargeback

No gateway nada muda: `liable` no master (E0.3.5), porque a Pagar.me debita sem olhar saldo. A
regra congelada decide o razão quando o webhook de chargeback chega:

| `chargeback_bearer` | Efeito no razão |
|---|---|
| `each` | Como hoje: a perna do parceiro vira dívida, a Movepark perde a parte dela |
| `partner` | A dívida é o valor **inteiro** contestado |
| `movepark` | Não nasce dívida |

Implementação: `payment.chargeback_debt_cents` (nulo fora de chargeback) gravado pelo webhook
conforme o `bearer`, e `payout_debt_cents` passa a somar essa coluna quando preenchida, em vez da
fórmula da perna, para os pagamentos de chargeback. Estorno por cancelamento **não** muda: segue a
regra do híbrido.

## Telas

- **Manager › Financeiro › Comissões** (`/manager/finance/commissions`): o card "Comissão por
  origem da venda" cadastra as regras (globais e por empresa: UTMs aceitos, white-label, pacote,
  vigência, prioridade), mostra o exemplo em reais e avisa quando a comissão não cobre a taxa que
  a Movepark prometeu pagar. Abaixo, a comissão padrão por empresa (o que já existia) e o relatório
  "Vendas por canal" com o alerta de concentração. Componentes em `src/features/commission/`.
- **Tela da reserva (Manager)**: card "Canal da venda" com o canal, o pacote, a prova da origem e
  "Corrigir canal" enquanto não há pagamento pago (RPC com histórico).
- **Tela da reserva (Operator)**: o mesmo card com canal e comissão. Sem taxa, chargeback nem prova.
- **Operator › Repasses**: card "Vendas que você traz", com as regras da empresa dele (RPC
  `my_commission_channels`, escopo `finance:read`) e o link de cada unidade já com o UTM. Some
  quando a empresa não tem regra.
- Os padrões do Hub (`commission_default_*`, janela e percentual do alerta) ficam em `app_setting`,
  sem tela própria por enquanto: mudam raramente e o valor inicial é o comportamento de hoje.

## Contra abuso

- Alerta no Manager quando, em 30 dias, mais de X% das vendas de uma empresa caem no canal dela
  (X em `app_setting.commission_partner_share_alert_pct`, começa em 60).
- A prova (`attribution`) fica na reserva para disputa.
- A correção manual tem histórico.

## Permissões

Escrita de regra: só `hub_admin`, pela RLS de `commission_rule` (policy única com
`is_hub_admin()`); o trigger normaliza os UTMs e recusa UTM repetido no mesmo dono. Correção de
reserva: RPC `admin_set_booking_commission`, só `hub_admin`. Sem escopo novo de empresa. Leitura
pelo parceiro: o pacote pela própria reserva (a RLS já deixa), e as regras dele por
`my_commission_channels`, que exige `finance:read` e nunca devolve regra global nem de outra empresa.
`resolve_commission` e `booking_apply_commission` só rodam para `service_role` e `hub_admin`.

## Como ficou implementado

| Peça | Onde |
|---|---|
| Regras, resolução, congelamento, correção | `20261121050000_comissao_por_origem.sql`, pgTAP `commission_rule.test.sql` (45) |
| Chargeback pela regra | `20261121060000_chargeback_pela_regra.sql`, pgTAP `payout_debt.test.sql` (37), `_shared/payments/commission.ts` (`chargebackDebtCents`), `pagarme-webhook` |
| Canais do parceiro | `20261121070000_canais_de_venda_do_parceiro.sql` |
| Relatório e alerta | `20261121080000_relatorio_por_canal.sql` |
| Prova do clique no front | `src/lib/utm.ts` (localStorage, `clicked_at`, página de entrada, referrer sem query; descarta depois de 30 dias, quem decide a janela é o banco) |
| Criação da reserva | `create-booking`: `montarAtribuicao` (só campos nomeados e conferidos) e `booking_apply_commission` sempre, mesmo sem UTM |
| Cobrança | `create-pix-charge` e `create-card-charge`: `commissionForCharge` lê o pacote; reserva que nasceu sem ele (MCP, API, falha na criação) é congelada ali, antes do split; o rastro do gateway grava canal, comissão e pagador da taxa |
| Split | `buildSplit({ feePayer })` |

Duas decisões de implementação que o desenho não previa:

1. **Congelamento tardio.** A reserva criada por MCP ou pela Public API não passa pelo
   `create-booking`. Em vez de espalhar a chamada, a Edge de cobrança congela quem chega sem
   pacote. O resultado é o mesmo (a regra olha `created_at` da reserva, não a hora da cobrança).
2. **Comissão baixa e taxa por conta da Movepark.** A exceção de segurança do `buildSplit` continua
   valendo: com 5% de comissão no cartão (taxa estimada de 6%) a taxa volta para a perna do
   parceiro, senão a Movepark pagaria para vender. A tela avisa isso na hora de cadastrar a regra.

## Plano de ação

Cada fase fecha com typecheck, lint, `bun run test` e os testes da própria fase verdes, migration
aplicada e spec atualizada. Nenhuma fase muda comportamento para quem não tem regra cadastrada.

| Fase | Entrega | Testes | Aceite |
|---|---|---|---|
| 1. Modelo e resolução | `commission_rule`, `resolve_commission`, colunas congeladas em `booking`, `app_setting` dos padrões | pgTAP: casa por UTM, empresa vence global, prioridade, vigência, UTM de outra empresa não casa, white-label, sem regra = Hub, RLS | Toda reserva nova nasce com pacote = padrão do Hub |
| 2. Atribuição 7 dias | `utm.ts` em `localStorage` com `clicked_at`, URL e referrer; `create-booking` grava `attribution` e chama a resolução | Vitest: janela, último clique, chegada sem UTM não apaga, expiração. Deno: validação do objeto, UTM lixo ignorado | Reserva criada 3 dias depois do clique casa a regra; 8 dias depois, não |
| 3. Cobrança pelo pacote | Edges de PIX e cartão leem a reserva; `buildSplit` com `feePayer` | Deno: split com `partner` e `movepark`, exceção da perna pequena, comissão 0%, regressão sem regra | Split no gateway bate com o pacote congelado |
| 4. Chargeback por regra | `payment.chargeback_debt_cents`, webhook e `payout_debt_cents` | pgTAP nos três `bearer`; Deno do webhook | Dívida conforme a regra; `each` idêntico a hoje |
| 5. Manager | Cadastro de regras, tela da reserva, correção com auditoria | Testes de componente, contrato de mutations, cenário de rota | Cadastrar regra e ver aplicada numa reserva nova |
| 6. Operator | Canal e comissão na reserva e no extrato; link rastreado | Testes de componente | Parceiro gera o link e vê a comissão que valeu |
| 7. Relatórios e alerta | Recorte por canal; alerta de concentração | pgTAP da RPC de relatório | Número por canal confere com as reservas |
| 8. Validação em produção | Roteiro abaixo | | Quatro compras conferidas no gateway |
| 9. Docs | Esta spec, payment-split, painéis, ADR se virar regra de arquitetura | | |

### Roteiro de validação em produção (Agência Fera)

Regra de teste (já cadastrada, pela própria tela do Manager): empresa Agência Fera,
`utm_source = agenciafera`, comissão 10%, taxa por conta do parceiro, chargeback `each`. Link:
`/estacionamentos/jardim-paulista/agencia-fera?utm_source=agenciafera&utm_medium=parceiro`.

Já conferido sem compra: a regra resolve ao vivo (com UTM 10% e taxa no parceiro; sem UTM ou com
clique de 9 dias, padrão do Hub); o front grava a prova do clique e ela sobrevive a outra
navegação; `booking_apply_commission` numa reserva real não paga da Fera devolve o pacote da
regra, e numa já paga não muda nada (rodado em transação revertida).

1. Compra **sem UTM**: split 80/20, taxa na Movepark. Reserva com canal `hub`.
2. Compra entrando por `?utm_source=agenciafera`: split 90/10, taxa na perna da Fera. Reserva com
   a regra, a prova da origem e o `clicked_at`.
3. Compra com `?utm_source=qualquer-coisa` (não cadastrado): canal `hub`, 80/20.
4. Clique com `agenciafera` hoje, compra **amanhã** sem UTM na URL: ainda casa a regra.
5. Cancelar a compra do passo 2: o híbrido devolve a perna dele conforme o que ele recebeu
   (90% menos a taxa que ele pagou).
6. Conferir em cada uma: gateway trail (split e `charge_processing_fee`), tela da reserva, extrato
   do parceiro, recebíveis apurados.

Chargeback não dá para provocar em produção; fica coberto por pgTAP e pelo teste do webhook.

## Fora do escopo

- Afiliado terceiro recebendo comissão.
- Regra por `utm_medium` ou `utm_campaign` (as colunas existem e a prova guarda os três; evoluir é
  acrescentar colunas de casamento na regra).
- Regra por origem da Public API e do MCP.
- Preço diferente por origem: o cliente paga o mesmo em qualquer canal.
- Aplicação retroativa: reserva já criada não muda de pacote sozinha.
