# Capacity Rules — Controle de Disponibilidade

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
-- Nova tabela necessária
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
