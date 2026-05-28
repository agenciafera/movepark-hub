-- Motor de cálculo de preço dinâmico
-- Substitui as 41 classes PHP hardcoded do legado por configuração em banco

create table public.pricing_rule (
  id                         uuid primary key default gen_random_uuid(),
  location_parking_type_id   uuid not null unique
                               references public.location_parking_type(id) on delete cascade,

  -- estratégia de cálculo
  strategy  text not null
    check (strategy in (
      'tiered_progressive',
      'uniform_by_duration',
      'fixed_bracket',
      'incremental_formula',
      'monthly_remainder',
      'hourly_capped',
      'surcharge'
    )),

  -- tratamento de fração de dia
  fractional_day_policy     text not null default 'any_extra'
    check (fractional_day_policy in (
      'any_extra',
      'hour_tolerance',
      'threshold_with_minutes',
      'time_of_day',
      'none'
    )),
  fractional_day_tolerance  numeric(5,2),  -- horas (ex: 1.0) ou hora do dia (ex: 1.0 = 01:00)

  -- preço "de" exibido riscado na UI
  old_price_strategy    text not null default 'none'
    check (old_price_strategy in ('none', 'multiplier', 'own_table')),
  old_price_multiplier  numeric(6,4),  -- ex: 1.20

  -- padrão 4: incremental_formula
  incremental_one_day_price   numeric(12,2),
  incremental_two_days_price  numeric(12,2),
  incremental_base            numeric(12,2),  -- valor fixo de incremento
  incremental_multiplier      numeric(12,4),  -- por dia a partir do 3º

  -- padrão 5: monthly_remainder
  monthly_fixed_price  numeric(12,2),
  monthly_daily_rate   numeric(12,2),

  -- padrão 6: hourly_capped
  hourly_initial_rate    numeric(12,2),  -- 0–30 min
  hourly_one_hour_rate   numeric(12,2),  -- 31–60 min
  hourly_fraction_rate   numeric(12,2),  -- por hora adicional
  hourly_daily_rate      numeric(12,2),  -- teto diário
  hourly_hours_per_day   integer,        -- horas que equivalem a 1 diária (ex: 13)

  -- padrão 7: surcharge
  surcharge_source_id   uuid references public.location_parking_type(id) on delete restrict,
  surcharge_multiplier  numeric(6,4),  -- ex: 1.40

  -- validações de reserva
  advance_booking_minutes  integer,  -- mínimo de minutos no futuro para check-in
  operating_hours          jsonb,    -- config de dias/horários para hourly_capped

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at_pricing_rule
  before update on public.pricing_rule
  for each row execute procedure public.set_updated_at();


-- Faixas de preço para padrões 1, 2, 3 e old_price com tabela própria
create table public.pricing_tier (
  id               uuid primary key default gen_random_uuid(),
  pricing_rule_id  uuid not null references public.pricing_rule(id) on delete cascade,

  from_day     integer not null check (from_day >= 1),
  to_day       integer,           -- null = sem limite superior (faixa aberta)
  unit_price   numeric(12,2),     -- preço por dia (padrões 1 e 2)
  total_price  numeric(12,2),     -- preço total fixo (padrão 3)
  is_old_price boolean not null default false,  -- true = linha de preço de balcão

  check (unit_price is not null or total_price is not null)
);

create index on public.pricing_tier (pricing_rule_id);


-- Faixas por minuto para hourly_capped (padrão 6)
create table public.pricing_hourly_bracket (
  id               uuid primary key default gen_random_uuid(),
  pricing_rule_id  uuid not null references public.pricing_rule(id) on delete cascade,

  from_minutes  integer not null check (from_minutes >= 0),
  to_minutes    integer,          -- null = até o teto diário
  price         numeric(12,2) not null,
  is_old_price  boolean not null default false
);

create index on public.pricing_hourly_bracket (pricing_rule_id);


-- RLS: catálogo de preços é leitura pública (necessário para simulação de preço)
alter table public.pricing_rule enable row level security;
alter table public.pricing_tier enable row level security;
alter table public.pricing_hourly_bracket enable row level security;

create policy "pricing_rule public read"
  on public.pricing_rule for select
  to anon, authenticated
  using (true);

create policy "pricing_tier public read"
  on public.pricing_tier for select
  to anon, authenticated
  using (true);

create policy "pricing_hourly_bracket public read"
  on public.pricing_hourly_bracket for select
  to anon, authenticated
  using (true);
