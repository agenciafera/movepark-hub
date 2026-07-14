# Pricing Engine — Motor de Cálculo Dinâmico

## Contexto

No sistema legado, cada par `empresa/unidade/tipo-de-vaga` tem uma **classe PHP dedicada**
com os valores e fórmulas hardcoded. Existem 41 classes distribuídas em 13 grupos.
Qualquer mudança de preço exige deploy de código.

O objetivo do Hub é substituir esse modelo por um **motor dinâmico configurável via painel**:
preços, taxas, faixas e regras configurados em banco de dados, sem código novo.

---

## Padrões de cálculo identificados

### Padrão 1 — Diária Progressiva (`tiered_progressive`)

Cada faixa de dias tem seu próprio preço por dia. O total é a **soma de cada camada**.

```
dias 1-6  × R$ 19,90
dias 7-14 × R$ 21,90  (somente os dias dentro dessa faixa)
dias 15+  × R$ 23,90
```

**Exemplos no legado:** Abbapark Vagacoberta/Descoberta, Aerovalet Congonhas,
NationPark Vagacoberta/Descoberta.

---

### Padrão 2 — Diária Uniforme por Duração (`uniform_by_duration`)

O total de dias seleciona UMA taxa que é aplicada a **todos os dias**.

```
total 1-5 dias  → R$ 27,90/dia × total_dias
total 6-15 dias → R$ 23,90/dia × total_dias
total 16+ dias  → R$ 20,90/dia × total_dias
```

**Exemplos no legado:** Aeropark Vagacoberta/Descoberta, Plenty, Garageinn Virapark.

---

### Padrão 3 — Valor Fixo por Faixa (`fixed_bracket`)

Cada faixa de dias tem um **valor total fixo** (`pricing_tier.total_price`), sem multiplicação por
dia. Se a faixa não tiver total e sim `unit_price`, o motor cobra `unit_price × dias` (ver o
pseudocódigo em "Cálculo"), o que vale para qualquer faixa, aberta ou fechada. É isso que permite
misturar total fixo e diária na mesma tabela.

```
1 dia   → R$ 149,00
2 dias  → R$ 198,00
3 dias  → R$ 297,00
6-10 dias → R$ 594,00
30+ dias  → R$ 792,00 + (dias - 30) × R$ 26,40
```

**Exemplos no legado:** Aeropark Valet. NationPark mistura fixo (1-2 dias) com diária (3+).
O Virapark usa total fixo só em 1 dia e diária nas demais faixas.

**Curva invertida.** Nada no motor impede uma tabela em que ficar mais dias custa menos no total
(ex.: 6 dias por R$ 179,40 e 7 dias por R$ 125,30). Pode ser intencional, então não é bloqueio: o
painel do parceiro avisa ao salvar e marca o card, e o simulador sinaliza a linha
(`findCurveInversions`, em `src/features/parking-types/pricing-curve.ts`).

---

### Padrão 4 — Fórmula Incremental (`incremental_formula`)

Preços especiais para 1 e 2 dias; a partir do 3º aplica `base + (dias × multiplicador)`.

```
1 dia   → one_day_price  (ex: R$ 25,00)
2 dias  → two_days_price (ex: R$ 28,00)
3+ dias → increment + (dias × multiplier)  (ex: R$ 10 + dias × R$ 9)
```

**Exemplos no legado:** Airpark (Faro, Lisboa), Redpark, Skypark.
Todos herdam `PortugalBasePriceCalculation` com parâmetros diferentes.

| Empresa/Unidade | one_day | two_days | increment | multiplier |
|---|---|---|---|---|
| Airpark Faro — Coberto | 25 | 28 | 10 | 9 |
| Airpark Faro — Descoberto | 20 | 20 | 10 | 5 |
| Airpark Lisboa — Coberto | 25 | 28 | 10 | 9 |
| Airpark Lisboa — Descoberto | 20 | 24 | 10 | 7 |
| Redpark — Coberto | 25 | 26 | 10 | 8 |
| Redpark — Descoberto | 20 | 22 | 10 | 6 |
| Skypark — Coberto | 25 | 24 | 10 | 7 |
| Skypark — Descoberto | 20 | 20 | 10 | 5 |

---

### Padrão 5 — Mensal com Resto Diário (`monthly_remainder`)

Períodos de 30 dias são cobrados a um preço fixo de pacote; dias restantes à diária.

```
floor(dias / 30) × monthly_price + (dias % 30) × daily_rate
Regra especial: dias 15-30 → usa monthly_price diretamente (teto)
```

**Exemplos no legado:** Ferapark Vagacoberta (R$310/30dias, R$21,99/dia) e
Vagadescoberta (R$220/30dias, R$14,99/dia).

---

### Padrão 6 — Por Hora com Teto Diário (`hourly_capped`)

Cálculo granular em minutos/horas, com teto de diária. Exclusivo para estacionamentos
de curta permanência (não aeroporto).

```
0–30 min      → initial_rate
31–60 min     → one_hour_rate
cada hora +   → one_hour_rate + (horas_extras × hourly_fraction)  até daily_rate
N diárias     → complete_dailies × daily_rate + resto hourly
```

Também valida **horário de funcionamento** (dias da semana + horário de abertura/fechamento).

**Exemplos no legado:** Moveparking Nova Iguaçu (Vagacarro e Vagamoto, sendo moto = 50% do carro).

---

### Padrão 7 — Sobretaxa sobre Outro Tipo (`surcharge`)

Herda o cálculo de outro `pricing_rule` e aplica um multiplicador percentual.

```
preco_final = preco_do_tipo_base × surcharge_multiplier
```

**Exemplos no legado:** Aerovalet Gruparking `VagacobertaSelfPark` e `VagadescobertaSelfPark`
aplicam 1.40× sobre o tipo pai `Vagacoberta` / `Vagadescoberta`.

---

## Regras transversais

### Tratamento de fração de dia (`fractional_day_policy`)

Todos os cálculos baseados em dias precisam decidir o que fazer com horas/minutos residuais.

| Valor | Comportamento | Exemplo no legado |
|---|---|---|
| `any_extra` | Qualquer hora ou minuto residual = +1 dia | Aerovalet Tietê, Vagacoberta |
| `hour_tolerance` | Adiciona +1 dia somente se `(horas + min/60) > tolerance_hours` | Garageinn (tolerance = 1h) |
| `threshold_with_minutes` | Adiciona +1 se `(min > 0 && horas >= 1) OR horas > 1` | Abbapark, Aeropark |
| `time_of_day` | Adiciona +1 somente se checkout após hora X do dia seguinte | Airpark Portugal (01:00) |
| `none` | Sem arredondamento — usa dias exatos | — |

### Old Price / Preço de Balcão (`old_price_strategy`)

Preço "de" exibido riscado na UI para mostrar desconto online. **Âncora estática** (marketing) —
não reduz o total cobrado.

| Valor | Comportamento |
|---|---|
| `none` | Não exibe old price |
| `multiplier` | `old_price = calculate() × old_price_multiplier` (ex: 1.10, 1.20) |
| `own_table` | Old price tem sua própria tabela de faixas (`pricing_tier.is_old_price = true`) |

> **Camada de desconto automático (ver [discount-rules.md](./discount-rules.md)):** além do old_price
> estático, há (especificado, a implementar) um motor de **regras de desconto** avaliado **dentro do
> `simulate_price`** que **de fato reduz** o preço. Quando uma regra aplica, ela tem **precedência**:
> `price = base − desconto` e `old_price = base` (âncora real, riscada). Sem regra ativa, vale o
> `old_price_strategy` estático acima. O cupom (código) empilha **depois**, sobre o preço já descontado.

**Casos com `own_table`:**
- Plenty Congonhas: preço online 1-6d = R$30/d; balcão 1-6d = R$40/d (tabela separada)
- Garageinn Virapark: `counter_price` fixo R$40 vs diárias progressivas online

### Sobretaxa percentual (`surcharge_multiplier`)
Percentual aplicado em cima do cálculo de outro tipo de vaga.
Requer `surcharge_source_id` → FK para outro `location_parking_type`.

---

## Modelo de banco proposto

### `pricing_rule`

Vinculada 1:1 a `location_parking_type`.

```sql
create table public.pricing_rule (
  id                          uuid primary key default gen_random_uuid(),
  location_parking_type_id    uuid not null unique
                                references public.location_parking_type(id) on delete cascade,

  -- estratégia principal
  strategy  text not null,
  -- valores: tiered_progressive | uniform_by_duration | fixed_bracket |
  --          incremental_formula | monthly_remainder | hourly_capped | surcharge

  -- tratamento de fração de dia
  fractional_day_policy       text not null default 'any_extra',
  -- valores: any_extra | hour_tolerance | threshold_with_minutes | time_of_day | none
  fractional_day_tolerance    numeric(5,2),   -- horas (ex: 1.0) ou hora do dia (ex: 1.0 = 01:00)

  -- old price
  old_price_strategy          text not null default 'none',
  -- valores: none | multiplier | own_table
  old_price_multiplier        numeric(6,4),   -- ex: 1.20

  -- padrão 4 (incremental_formula) — parâmetros específicos
  incremental_one_day_price   numeric(12,2),
  incremental_two_days_price  numeric(12,2),
  incremental_base            numeric(12,2),  -- increment
  incremental_multiplier      numeric(12,4),  -- por dia

  -- padrão 5 (monthly_remainder)
  monthly_fixed_price         numeric(12,2),
  monthly_daily_rate          numeric(12,2),

  -- padrão 6 (hourly_capped)
  hourly_initial_rate         numeric(12,2),  -- 0–30 min
  hourly_one_hour_rate        numeric(12,2),  -- 31–60 min
  hourly_fraction_rate        numeric(12,2),  -- por hora adicional
  hourly_daily_rate           numeric(12,2),  -- teto diário
  hourly_hours_per_day        integer,        -- horas que configuram 1 diária (ex: 13)

  -- padrão 7 (surcharge)
  surcharge_source_id         uuid references public.location_parking_type(id) on delete restrict,
  surcharge_multiplier        numeric(6,4),   -- ex: 1.40

  -- validações de reserva
  advance_booking_minutes     integer,        -- mínimo de minutos no futuro (ex: 30)
  operating_hours             jsonb,          -- config de dias/horários (padrão 6)

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

### `pricing_tier`

Faixas de preço para padrões 1, 2 e 3. Também usado para old price com tabela própria.

```sql
create table public.pricing_tier (
  id               uuid primary key default gen_random_uuid(),
  pricing_rule_id  uuid not null references public.pricing_rule(id) on delete cascade,

  from_day         integer not null check (from_day >= 1),
  to_day           integer,          -- null = sem limite superior
  unit_price       numeric(12,2),    -- preço por dia (padrões 1 e 2)
  total_price      numeric(12,2),    -- preço total fixo (padrão 3)
  is_old_price     boolean not null default false,  -- true = linha de preço de balcão

  check (unit_price is not null or total_price is not null)
);
create index on public.pricing_tier (pricing_rule_id);
```

### `pricing_hourly_bracket`

Faixas por minuto para o padrão 6 (`hourly_capped`).

```sql
create table public.pricing_hourly_bracket (
  id               uuid primary key default gen_random_uuid(),
  pricing_rule_id  uuid not null references public.pricing_rule(id) on delete cascade,

  from_minutes     integer not null check (from_minutes >= 0),
  to_minutes       integer,          -- null = até o teto diário
  price            numeric(12,2) not null,
  is_old_price     boolean not null default false
);
create index on public.pricing_hourly_bracket (pricing_rule_id);
```

---

## Consumidores do motor (reuso, sem regra nova)

- **Tabela "Ver preços por duração" (PRD-10, ✅):** o listing reusa `simulate_price` para vários
  buckets de dias (`[1,2,3,5,7,10,15,30]` + a duração buscada) via `useDurationPrices` (`useQueries`,
  mesma cache key do reservation card) e mostra total + por-dia. Não há regra nova nem batch RPC — são
  N chamadas client-side cacheadas (mesmo padrão do `PricingSimulationDialog` do operador). Preço
  sazonal (Tábua de Marés) é v2 do motor.

## Algoritmo de cálculo (pseudocódigo)

```
function calculate(rule, check_in, check_out):
  if rule.strategy == 'surcharge':
    base = calculate(rule.surcharge_source.pricing_rule, check_in, check_out)
    return base × rule.surcharge_multiplier

  days = compute_days(check_in, check_out, rule.fractional_day_policy, rule.fractional_day_tolerance)

  switch rule.strategy:
    case 'tiered_progressive':
      return sum_tiered(rule.tiers, days)

    case 'uniform_by_duration':
      tier = find_tier_for(rule.tiers, days)
      return tier.unit_price × days

    case 'fixed_bracket':
      tier = find_tier_for(rule.tiers, days)
      if tier.total_price: return tier.total_price
      return tier.unit_price × days  -- faixa aberta (30+ dias)

    case 'incremental_formula':
      if days == 1: return rule.incremental_one_day_price
      if days == 2: return rule.incremental_two_days_price
      return rule.incremental_base + (days × rule.incremental_multiplier)

    case 'monthly_remainder':
      months = floor(days / 30)
      remainder = days % 30
      if days >= 15 and days <= 30: return rule.monthly_fixed_price
      return (months × rule.monthly_fixed_price) + (remainder × rule.monthly_daily_rate)

    case 'hourly_capped':
      minutes = total_minutes(check_in, check_out)
      return calculate_hourly(rule, minutes)
```

---

## Exemplos de configuração (dados de seed futuros)

### Aeropark Guarulhos — Vaga Coberta
```
strategy:                uniform_by_duration
fractional_day_policy:   any_extra
old_price_strategy:      multiplier
old_price_multiplier:    1.20
tiers:
  from_day=1,  to_day=5,   unit_price=27.90
  from_day=6,  to_day=15,  unit_price=23.90
  from_day=16, to_day=null, unit_price=20.90
```

### Aeropark Guarulhos — Valet
```
strategy:                fixed_bracket
fractional_day_policy:   any_extra
old_price_strategy:      none
tiers:
  from_day=1,  to_day=1,  total_price=149.00
  from_day=2,  to_day=2,  total_price=198.00
  from_day=3,  to_day=3,  total_price=297.00
  from_day=4,  to_day=4,  total_price=396.00
  from_day=5,  to_day=5,  total_price=495.00
  from_day=6,  to_day=10, total_price=594.00
  from_day=11, to_day=17, total_price=693.00
  from_day=18, to_day=30, total_price=792.00
  from_day=31, to_day=null, total_price=null, unit_price=26.40  -- 792 base via tier anterior
```

### Airpark Faro — Coberto
```
strategy:                    incremental_formula
fractional_day_policy:       time_of_day
fractional_day_tolerance:    1.0   (01:00)
old_price_strategy:          none
incremental_one_day_price:   25.00
incremental_two_days_price:  28.00
incremental_base:            10.00
incremental_multiplier:      9.00
```

### Moveparking Nova Iguaçu — Vagacarro
```
strategy:               hourly_capped
fractional_day_policy:  none
old_price_strategy:     none
hourly_initial_rate:    7.00
hourly_one_hour_rate:   10.00
hourly_fraction_rate:   3.00
hourly_daily_rate:      20.00
hourly_hours_per_day:   13
operating_hours: {
  "mon-fri": { "open": "07:00", "close": "20:00" },
  "saturday": { "open": "08:00", "close": "17:00" },
  "sunday": null
}
```

### Aerovalet Gruparking — Vaga Coberta Self Park
```
strategy:             surcharge
surcharge_source:     location_parking_type de Vagacoberta (Gruparking)
surcharge_multiplier: 1.40
```

### Aerovalet Guarulhos — Valet
```
strategy:             surcharge
surcharge_source:     location_parking_type de Valet (Aeropark Guarulhos)
surcharge_multiplier: 1.0   -- mesmo preço; herda tabela fixed_bracket completa do Aeropark
```

---

## Bugs confirmados

### [BUG-001] Aerovalet Valet GRU — Overflow 31+d retorna preço incorreto

**Descoberto em:** 2026-05-26 (via `docs/simulacao-precos.md`)  
**Impacto:** reservas de 31+ dias de valet no Aerovalet GRU cobram menos do que deveriam.

**Causa raiz:** o seed `20260526100003_seed_pricing_rules.sql` criou o `pricing_rule` do
Aerovalet Valet com `strategy = 'fixed_bracket'`, ignorando o `surcharge_source_id`
(que aponta corretamente para Aeropark Valet). A última tier local é
`{from_day=18, to_day=null, total_price=792}` — teto fixo para qualquer dia ≥ 18,
sem overflow. A tier 31+ d do Aeropark (`unit_price=26.40`) nunca é consultada.

| Cenário | Hub (R$) | Produção (R$) | Delta |
|---|---:|---:|---:|
| 35 dias | 792,00 | 924,00 | −132,00 |

Fórmula de overflow do Aeropark Valet: `792 + (dias − 30) × 26,40`

**Correção:** migration de dados — alterar `strategy = 'surcharge'`,
setar `surcharge_multiplier = 1.0`, excluir as tiers locais do Aerovalet Valet.
O `surcharge_source_id` já está correto no banco.

**Status:** ✅ Corrigido em `fix_aerovalet_valet_surcharge_seed` + `fix_aerovalet_valet_surcharge_source`.  
Duas correções aplicadas: (1) `strategy` → `surcharge`, `surcharge_multiplier=1.0`, tiers locais deletadas; (2) `surcharge_source_id` corrigido para `aeropark/aeroporto-guarulhos/valet` (estava apontando para `aerovalet/covered`).
