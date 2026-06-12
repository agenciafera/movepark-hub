# Capacity Rules — Controle de Disponibilidade

> **Status: ✅ Implementado** — migration `20260614000000_capacity_real.sql` (sobre a infra de
> hold/release já existente no baseline). **Ao mudar uma regra, atualize esta spec no mesmo PR.**

## Estado implementado (fonte de verdade)

O hold por data **já existia** no baseline; esta entrega o tornou confiável de ponta a ponta:

- **Hold na criação da reserva.** `create_booking_atomic` segura a vaga **ao criar o `pending`**
  (loop por data em `location_parking_availability`, `SELECT … FOR UPDATE`, `booked_count++`,
  rejeita se `booked_count >= capacity`) e grava `expires_at = now() + 30 min`.
- **Release do hold:** `release_booking_capacity(booking_id)` decrementa cada data. Chamado no
  **cancelamento manual** (checkout/my-bookings) **e** pela expiração automática.
- **Expiração de pending abandonado (novo):** `cron_expire_pending_bookings()` (pg_cron
  `expire-pending-bookings`, a cada 5 min) pega `pending` com `expires_at < now()`, chama
  `release_booking_capacity` e marca **`cancelled`** + `deleted_at` (não `no_show`). Sem isso o
  hold vazava para sempre em todo checkout abandonado.
- **Regras de reserva aplicadas (novo):** `create_booking_atomic` agora bloqueia (`P0001`) antes
  do hold quando viola `minimum_stay` (`min_stay_satisfied`), `minimum_date` ou a antecedência
  mínima (`pricing_rule.advance_booking_minutes`).
- **Disponibilidade exposta no produto (novo):**
  - `check_availability(company, location, parking_type, check_in, check_out)` → jsonb com
    `remaining` (= `capacity − max(booked_count nas datas)`), `sold_out`, `near_capacity`,
    `near_capacity_message`, `min_stay_ok`/`min_date_ok`/`advance_ok`, `ok` e `reasons[]`. Usado
    pelo `ReservationCard` do listing.
  - `availability_batch(lpt_ids[], check_in, check_out)` — uma query agregada para a edge
    `search` (sem N+1); cards marcam "Esgotado pro seu período"/quase-lotação e esgotados vão
    para o fim da lista.
- **Operador (novo):** edita `near_capacity_threshold`/`near_capacity_message` e
  `minimum_stay`/`minimum_date` em "Tipos de vaga" → diálogo **Regras de reserva** (UPDATE direto,
  RLS `lpt_operator_update`); vê ocupação por data em **`/operator/occupancy`** via
  `operator_location_occupancy(location_id, from, to)` (SECURITY DEFINER, gateada por empresa).
- **Capacidade real** já está no seed (`location_parking_type.capacity`, valores 15–1100) — a
  antiga pendência de "placeholder 0" estava desatualizada.

Testes: pgTAP `capacity.test.sql` (hold/esgotado/release + min_stay/min_date + expiração) e
`availability_rpc.test.sql` (`check_availability`/`availability_batch`/guard de ocupação); Vitest
`availability.logic`/`occupancy.logic`/`capacity-rules.logic` + componente `ResultCard`; deno
`search/availability.test.ts`; `test:int` garante os golden de preço inalterados.

---

## Como o legado funciona

O legado usa duas tabelas:

1. **`movepark_general_category_product`** (pivot `location × parking_type`)
   - `spot_limit` — capacidade máxima de vagas para aquela combinação
   - Configurável por par `category_id / product_id`

2. **`movepark_general_order_count`** — contador de ocupação **por data**
   - `product_id`, `category_id`, `current_date`, `total`
   - Uma reserva de N dias gera N linhas nessa tabela
   - `increaseOrderCount()` — chamado na criação da reserva
   - `decreaseOrderCount()` — chamado no cancelamento
   - `recountTotalOrders()` — recalcula em lote (útil após mudança de configuração)

### Algoritmo de checagem

```
para cada data D no intervalo [check_in, check_out):
    total = order_count WHERE product_id = X AND category_id = Y AND date = D
    se total >= spot_limit → rejeita
```

A checagem é feita **por dia individualmente** — uma reserva de 5 dias requer
que os 5 dias tenham vagas disponíveis.

### Configurações adicionais no legado

O `has_spot_limiter` é um toggle global por tenant (em `TenantSettings`).
A tabela pivot também armazena:
- `has_extra_warning` / `extra_warning_text` / `cta_link` — aviso de quase-lotação na UI

---

## Modelo proposto para o Hub

### Capacidade estática

Já modelada em `location_parking_type.capacity`.
Esta coluna representa o **teto total de vagas físicas** da unidade para aquele tipo.

### Ocupação dinâmica por data

Precisamos do equivalente ao `order_count` do legado:

```sql
-- ✅ tabela existente (baseline) — ocupação por data
create table public.location_parking_availability (
  id            uuid primary key default gen_random_uuid(),
  location_parking_type_id uuid not null
                  references public.location_parking_type(id) on delete cascade,
  date          date not null,
  booked_count  integer not null default 0 check (booked_count >= 0),
  unique (location_parking_type_id, date)
);
```

### Regras de negócio

- `booked_count` é incrementado para **cada data** do intervalo `[check_in_date, check_out_date)` ao confirmar uma reserva
- `booked_count` é decrementado ao cancelar
- Disponibilidade = `location_parking_type.capacity - booked_count`
- Checagem de disponibilidade deve verificar **todas as datas** do período, não só a de check-in
- Função ou trigger pode manter o `booked_count` consistente; a checagem de conflito deve usar `SELECT FOR UPDATE` ou equivalente para evitar race condition

### Aviso de quase-lotação (near-capacity warning)

O legado tinha um campo `extra_warning_text` no pivot.
No Hub, sugerimos um campo em `location_parking_type`:

```sql
near_capacity_threshold  integer  -- ex: 5 → avisa quando restam ≤ 5 vagas
near_capacity_message    text     -- texto customizável pelo painel
```

---

## Regras de permanência mínima

No legado, essas configs ficam em colunas da `category` (unidade).
No Hub, pertencem à `location_parking_type` pois variam por tipo de vaga.

| Campo | Tipo | Descrição |
|---|---|---|
| `has_minimum_stay` | boolean | habilita a regra |
| `minimum_stay_value` | integer | valor (ex: 1) |
| `minimum_stay_unit` | enum | `minutes`, `hours`, `days`, `months` |
| `has_minimum_date` | boolean | habilita data mínima de entrada |
| `minimum_date` | date | data mais cedo permitida para check-in |

---

## Regras de reserva (configurações da unidade)

Campos que existem na `category` do legado e precisam de destino no Hub:

| Campo legado | Destino sugerido | Descrição |
|---|---|---|
| `has_pcd_config` | `location` | habilita opção PCD |
| `has_passenger_quantity` | `location` | habilita seleção de passageiros |
| `reservation_policy` | `location` | texto da política (rich text) |
| `has_notice` / `notice` | `location` | aviso na página da unidade |
| `phone` / `email` / `address` | `location` | dados de contato |

> Essas colunas ainda não foram adicionadas ao schema. São candidatas para a próxima migration.
