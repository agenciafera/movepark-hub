# Database Schema — Movepark Hub

## Stack

- **Banco:** PostgreSQL via Supabase
- **Auth:** Supabase Auth (`auth.users`)
- **RLS:** habilitado em todas as tabelas públicas
- **Convenção:** nomes de tabelas e colunas em inglês (snake_case)

---

## Migrations

> **Rebaseline (2026-06-03):** o histórico de migrations foi consolidado num único
> **baseline** gerado do banco vivo — `supabase/migrations/20260101000000_baseline_from_live.sql`
> (schema completo) + `supabase/seed.sql` (catálogo/pricing, sem dados de cliente). O
> histórico anterior estava divergente (várias migrations aplicadas direto via MCP/dashboard,
> nunca commitadas, e timestamps fora de sincronia). Os arquivos antigos seguem no histórico
> do git. Daqui pra frente, mudanças de schema são novas migrations em `supabase/migrations/`
> a partir do baseline.

---

## Tabelas atuais

### Tenancy & Catálogo

```
company
├── id, name, slug (unique), legal_name, tax_id
├── status: entity_status (active/inactive/suspended)
└── created_at, updated_at, deleted_at

location
├── id, company_id → company
├── name, slug (unique per company), address, latitude, longitude, timezone
├── status: entity_status
└── created_at, updated_at, deleted_at

parking_type  (catálogo global)
├── id, code (unique), name, description
└── created_at, updated_at

company_parking_type  (empresa habilita tipo de vaga + configura padrão)
├── id, company_id → company, parking_type_id → parking_type
├── base_price, default_capacity, is_active
└── unique(company_id, parking_type_id)

location_parking_type  (instância do tipo de vaga na unidade)
├── id, location_id → location, company_parking_type_id → company_parking_type
├── capacity, is_active
└── unique(location_id, company_parking_type_id)

add_on_service  (serviços adicionais definidos pela empresa)
├── id, company_id → company
├── code (unique per company), name, description, base_price, is_active
└── created_at, updated_at

location_add_on_service  (serviço habilitado na unidade)
├── id, location_id → location, add_on_service_id → add_on_service
├── price_override (nullable), is_active
└── unique(location_id, add_on_service_id)
```

### Usuários & Veículos

```
profiles  (dados de domínio; PK = FK para auth.users)
├── id → auth.users
├── full_name, tax_id, phone, birth_date
└── created_at, updated_at, deleted_at

vehicle
├── id, profile_id → profiles
├── license_plate, model, color
└── created_at, updated_at, deleted_at
```

> `profiles` é populada automaticamente via trigger `on_auth_user_created`
> ao criar um usuário no Supabase Auth.

### Reservas

```
booking
├── id, code (unique)
├── profile_id → profiles
├── location_id → location
├── vehicle_id → vehicle (nullable)
├── check_in_at, check_out_at (check: check_out > check_in)
├── status: booking_status (pending/confirmed/checked_in/completed/cancelled/no_show)
├── total_amount, currency
└── notes, created_at, updated_at, deleted_at

booking_item
├── id, booking_id → booking
├── item_type: booking_item_type (parking | add_on)
├── parking_type_id → parking_type (se item_type = parking)
├── add_on_service_id → add_on_service (se item_type = add_on)
├── quantity, unit_price, subtotal
└── check: XOR entre parking_type_id e add_on_service_id
```

### Pagamentos & Cupons

```
payment
├── id, booking_id → booking
├── provider, provider_payment_id
├── amount, currency
├── status: payment_status (pending/authorized/paid/refunded/failed/cancelled)
└── paid_at, created_at, updated_at

coupon
├── id, company_id → company
├── code (unique per company)
├── discount_type: discount_type (percent | fixed)
├── discount_value, valid_from, valid_until
├── max_uses, times_used, is_active
└── created_at, updated_at

booking_coupon  (pivot)
├── booking_id → booking
├── coupon_id → coupon
├── discount_applied
└── PK(booking_id, coupon_id)
```

---

## RLS (Row Level Security)

| Tabela | Regras aplicadas |
|---|---|
| `company`, `location`, `parking_type`, `company_parking_type`, `location_parking_type`, `add_on_service`, `location_add_on_service`, `coupon` | Leitura pública (`anon` + `authenticated`) para registros ativos |
| `profiles` | Owner-only: SELECT e UPDATE apenas para `auth.uid() = id` |
| `vehicle` | Owner-only: todas as operações para `profile_id = auth.uid()` |
| `booking` | Owner-only: SELECT/INSERT/UPDATE para `profile_id = auth.uid()` |
| `booking_item`, `payment`, `booking_coupon` | Acesso via ownership da `booking` pai |

> Nenhuma política de escrita existe ainda para staff/admin. Isso será coberto
> quando o modelo de roles/staff for definido.

---

## Pendências de schema

As tabelas abaixo ainda não foram criadas e são necessárias:

### Alta prioridade

| Tabela | Spec de referência |
|---|---|
| `pricing_rule` | [pricing-engine.md](./pricing-engine.md) |
| `pricing_tier` | [pricing-engine.md](./pricing-engine.md) |
| `pricing_hourly_bracket` | [pricing-engine.md](./pricing-engine.md) |
| `location_parking_availability` | [capacity-rules.md](./capacity-rules.md) |

### Média prioridade

| Colunas/Tabela | Destino | Spec de referência |
|---|---|---|
| `minimum_stay_*`, `minimum_date_*` | `location_parking_type` | [capacity-rules.md](./capacity-rules.md) |
| `near_capacity_threshold`, `near_capacity_message` | `location_parking_type` | [capacity-rules.md](./capacity-rules.md) |
| `has_pcd_config`, `has_passenger_quantity`, `reservation_policy`, `has_notice`, `notice` | `location` | [capacity-rules.md](./capacity-rules.md) |

### Futuro (fora do MVP)

| Item | Motivo |
|---|---|
| Staff / roles de backoffice | Decisão de modelo ainda pendente |
| Preço dinâmico por janela/dia da semana/feriado | Definido como v2, não MVP |
| `user_company` pivot | Só se surgir necessidade de dados por par usuário×empresa |
