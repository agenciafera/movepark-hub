# Agendamento de tabela de preço

> **Status:** implementado em 04/11/2026 (migration `20261201180000_agendamento_de_preco.sql`).
> Relacionado: [pricing-engine.md](./pricing-engine.md) · [espelhamento-preco-wl.md](./espelhamento-preco-wl.md) ·
> [deploy-automatico.md](./deploy-automatico.md) · [permissions.md](./permissions.md).

## 1. O problema

Parceiro que trabalha com tabela fixa por período avisa com antecedência: "esta tabela vale até
30/11, a partir de 01/12 é esta outra". O caso que originou a funcionalidade é o Pare Seguro (GRU),
que manda a tabela de balcão com a vigência escrita nela.

Até aqui a troca dependia de alguém lembrar de editar o preço na virada do dia, ou de um pg_cron
escrito à mão para cada caso (o `pare-seguro-tabela-dezembro`, jobid 106, foi o primeiro e foi
migrado para este mecanismo). Não ficava rastro de qual tabela valia em cada data.

## 2. Decisões travadas

| # | Decisão | Por quê |
|---|---|---|
| D1 | **A vigência é pela data da COMPRA**, não da estadia. Quem compra até a véspera paga a tabela antiga, mesmo para estacionar depois da troca. | É como tabela de balcão funciona ("tarifa atual até 30/11"), e foi o que o Kallef decidiu em 04/11/2026 para o Pare Seguro. Preço pela data da estadia é **sazonalidade**, épico separado (§8). |
| D2 | **O motor de preço não muda.** `simulate_price` continua lendo a tabela atual; o agendamento troca a tabela na hora marcada. | Os 29 pontos que pedem preço (busca, listing, card "a partir de", índice de preços, API, MCP, chat, checkout) seguem iguais. Dois motores divergem em silêncio (ver pricing-engine.md, "Consumidores do motor"). |
| D3 | O agendamento guarda a **tabela inteira**: regra, faixas, faixas do preço riscado, preço base e, opcionalmente, a estadia mínima. | Tabela nova costuma mexer em mais de um campo (o Pare Seguro sobe o preço e a estadia mínima juntos). Guardar só um delta exigiria regra de merge. |
| D4 | A data é um **dia**, e a troca acontece às **0h no fuso da unidade** (`location.timezone`, padrão `America/Sao_Paulo`). | O parceiro pensa em "a partir de 01/12", não em horário UTC. |
| D5 | Um tipo de vaga pode ter **vários agendamentos** (dezembro, janeiro, ...), mas só um por dia. | Parceiro pode mandar o calendário do verão inteiro de uma vez. |
| D6 | **Unidade espelhada do white-label não agenda.** A RPC recusa e o cron marca falha se a unidade virou espelhada depois. | O espelho (`wl-price-mirror`) reescreve a tabela a cada passada; o agendamento seria desfeito em minutos. Nessas unidades o preço muda no sistema antigo. |
| D7 | Editar o preço na mão **não cancela** o agendamento. A tela mostra o agendamento pendente ao lado do preço atual. | O agendamento é uma ordem explícita com data. Cancelar sozinho por causa de uma edição de hoje surpreenderia mais. |
| D8 | Escrita só por RPC `SECURITY DEFINER` com o escopo **`pricing:write`** (ADR-005). Leitura por RLS para os membros da empresa e `hub_admin`. | Mesmo gate da edição de preço. |
| D9 | Na aplicação, a tabela que sai fica gravada no próprio agendamento (`replaced`). | Histórico de qual tabela valia em cada data, que antes não existia. |
| D10 | Reserva já feita não muda (o preço é snapshot na `booking`). | Igual a qualquer edição de preço. |

## 3. Modelo

`public.pricing_schedule`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `company_id` | uuid | Denormalizado para a RLS |
| `location_parking_type_id` | uuid FK | |
| `effective_date` | date | O dia, como o parceiro escolheu |
| `effective_at` | timestamptz | `effective_date` às 0h no fuso da unidade, calculado pela RPC |
| `base_price` | numeric null | null = não mexe no preço base |
| `rule` | jsonb | Mesmo formato do `p_rule` de `operator_set_pricing` |
| `tiers` | jsonb | Faixas do preço cobrado |
| `old_tiers` | jsonb null | Faixas do preço riscado (`own_table`); null = não mexe |
| `minimum_stay_days` | int null | null = não mexe; ≥ 1 define a estadia mínima em diárias |
| `status` | text | `scheduled` → `applied` / `canceled` / `failed` |
| `applied_at`, `canceled_at` | timestamptz | |
| `error` | text | Motivo da falha |
| `replaced` | jsonb | Tabela que estava em vigor no momento da troca |
| `created_by`, `canceled_by` | uuid | |

Índice único parcial: um `scheduled` por (`location_parking_type_id`, `effective_date`).

## 4. Funções

- **`_pricing_write(lpt, base_price, rule, tiers, old_tiers)`**: interna, sem gate. É o único lugar
  que grava `pricing_rule` + `pricing_tier`. `operator_set_pricing`, `api_set_pricing` e o
  agendamento chamam ela. `old_tiers` null preserva as faixas do riscado (comportamento antigo).
- **`operator_set_pricing(..., p_old_tiers jsonb default null)`**: ganhou o parâmetro para o editor
  gravar a tabela do preço riscado, que antes não tinha tela.
- **`pricing_schedule_create(lpt, effective_date, base_price, rule, tiers, old_tiers,
  minimum_stay_days)`**: gate de empresa + `pricing:write`; recusa data de hoje ou passada,
  unidade espelhada (D6) e dia já agendado (D5). Valida a regra pelo mesmo motor
  (`simulate_pricing_draft`) para não agendar tabela que não calcula.
- **`pricing_schedule_cancel(id)`**: mesmo gate; só cancela o que ainda está `scheduled`.
- **`pricing_schedule_apply_due()`**: roda pelo pg_cron `pricing-schedule-apply` **a cada minuto**.
  Aplica em ordem de `effective_at` tudo que venceu. Cada agendamento roda num bloco próprio:
  falha vira `failed` com o erro e não trava os outros.

O site se atualiza sozinho: `pricing_rule`, `pricing_tier` e `company_parking_type` já têm o
trigger `*_site_rebuild` (ver deploy-automatico.md).

## 5. Interface

No editor de preço (`PricingRuleEditor`, usado no /operator e no Manager):

- **"Quando vale"**: "Agora" ou "A partir de uma data". Com data, o botão vira "Programar para
  01/12/2026" e aparece o campo de estadia mínima a partir daquela data.
- **Preço de balcão com tabela própria** passa a ter editor de faixas (antes a opção existia sem
  tela para preencher).

No card do tipo de vaga, abaixo do preço atual, a lista de agendamentos pendentes e com falha,
com resumo das faixas e o botão "Cancelar".

## 6. Testes

- pgTAP `supabase/tests/pricing_schedule.test.sql`: gate de empresa e escopo, recusa de data
  passada, de unidade espelhada e de dia duplicado, aplicação na hora certa (e não antes),
  preservação do riscado quando `old_tiers` é null, estadia mínima, snapshot em `replaced`,
  cancelamento, falha isolada.
- Vitest: lógica da data mínima e do rótulo do botão (`pricing-schedule.logic.ts`) e o
  componente da lista.

## 7. Fora desta entrega

- **Public API e MCP de parceiro**: hoje só a tela agenda. Expor exige rota no `openapi.yaml`,
  tool no card e teste (ADR-003).
- **`priceValidUntil` no JSON-LD** com a data da próxima troca, no lugar da janela fixa de 90 dias.

## 8. Sazonalidade (épico separado, não implementado)

Preço pela **data da estadia** (feriado, alta temporada, fim de semana). Exige que o motor receba
datas (hoje recebe só o número de diárias), regra para estadia que atravessa duas temporadas e
uma resposta para o preço pré-renderizado ("a partir de" e tabela de preços saem sem data, e com
sazonalidade podem prometer o que a unidade não pratica na data do cliente, ADR-009). Promoção
por período já existe no motor de descontos (`discount_rule`, vigência e antecedência).
