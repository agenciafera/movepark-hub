-- Controle de disponibilidade por data e extensões de configuração de unidade

-- Tipo enum para unidade de permanência mínima
create type public.minimum_stay_unit as enum ('minutes', 'hours', 'days', 'months');


-- Disponibilidade por data (equivalente ao order_count do legado)
-- Uma linha por (location_parking_type, date); booked_count cresce a cada reserva confirmada
create table public.location_parking_availability (
  id                       uuid primary key default gen_random_uuid(),
  location_parking_type_id uuid not null
                             references public.location_parking_type(id) on delete cascade,
  date                     date not null,
  booked_count             integer not null default 0 check (booked_count >= 0),

  unique (location_parking_type_id, date)
);

create index on public.location_parking_availability (location_parking_type_id, date);

-- Leitura pública: necessário para verificar disponibilidade antes de criar reserva
alter table public.location_parking_availability enable row level security;

create policy "location_parking_availability public read"
  on public.location_parking_availability for select
  to anon, authenticated
  using (true);


-- Aviso de quase-lotação e regras de permanência mínima por tipo de vaga
alter table public.location_parking_type
  add column near_capacity_threshold  integer,        -- avisa quando vagas livres <= N
  add column near_capacity_message    text,           -- texto exibido na UI
  add column has_minimum_stay         boolean not null default false,
  add column minimum_stay_value       integer,
  add column minimum_stay_unit        public.minimum_stay_unit,
  add column has_minimum_date         boolean not null default false,
  add column minimum_date             date;           -- data mais cedo permitida para check-in


-- Configurações operacionais da unidade
alter table public.location
  add column has_pcd_config          boolean not null default false,  -- habilita opção PCD
  add column has_passenger_quantity  boolean not null default false,  -- habilita seleção de passageiros
  add column reservation_policy      text,           -- texto da política de reserva (rich text)
  add column has_notice              boolean not null default false,
  add column notice                  text,           -- aviso exibido na página da unidade
  add column phone                   text,
  add column email                   text;
