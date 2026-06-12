-- DAT-05 — Pontos do destino (terminais) + distância por terminal.
-- Hoje o destination guarda só 1 geo (o centro). Aeroportos multi-terminal (GRU: T1/T2/T3)
-- precisam de pontos próprios pra responder "estacionamento do Terminal 2" e "6 min ao T2".
-- Reaproveita haversine_km/proximidade do DAT-04; só troca o alvo (ponto, não o centro).
-- Sem API externa, sem PostGIS — distância calculada.

-- 1. Tabela de pontos do destino. Espelha as decisões de destination: type text (extensível),
--    hard delete via cascade (pontos são filhos do destino, dado de referência do admin).
create table public.destination_point (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destination(id) on delete cascade,
  name text not null,                       -- "Terminal 1", "T2", "Píer Sul"…
  type text not null default 'terminal'
    check (type in ('terminal', 'gate', 'pier', 'platform', 'other')),
  latitude numeric not null,
  longitude numeric not null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (destination_id, name)             -- idempotência do seed + sem terminal duplicado
);

create index destination_point_destination_id_idx
  on public.destination_point (destination_id, sort_order);

create trigger destination_point_set_updated_at
  before update on public.destination_point
  for each row execute function public.set_updated_at();

-- 2. RLS — espelha destination: leitura pública, escrita só hub_admin.
alter table public.destination_point enable row level security;

create policy "destination_point_select" on public.destination_point
  for select using (true);

create policy "destination_point_admin_write" on public.destination_point
  using (public.is_hub_admin()) with check (public.is_hub_admin());

-- 3. Ponto mais próximo de um destino, dado um lote (lat,lng). null se o destino não tem pontos.
--    Estende nearest_destination do DAT-04 — mesma ideia, alvo agora é o ponto.
create or replace function public.nearest_destination_point(
  p_lat numeric, p_lng numeric, p_destination_id uuid
) returns uuid
language sql stable set search_path to 'public'
as $$
  select dp.id
  from public.destination_point dp
  where dp.destination_id = p_destination_id
    and p_lat is not null and p_lng is not null
  order by public.haversine_km(p_lat, p_lng, dp.latitude, dp.longitude) asc
  limit 1;
$$;

-- 4. View de proximidade por terminal — uma linha por (lote, ponto do destino do lote).
--    distance_km on-the-fly (haversine), igual ao DAT-04. is_nearest marca o ponto mais perto
--    de cada lote (badge "📍 mais perto do T2"). security_invoker respeita a RLS das bases.
create view public.location_point_proximity
with (security_invoker = true) as
select
  l.id as location_id,
  l.destination_id,
  dp.id as destination_point_id,
  dp.name as point_name,
  dp.type as point_type,
  dp.sort_order,
  round(public.haversine_km(l.latitude, l.longitude, dp.latitude, dp.longitude), 2) as distance_km,
  (dp.id = public.nearest_destination_point(l.latitude, l.longitude, l.destination_id)) as is_nearest
from public.location l
join public.destination_point dp on dp.destination_id = l.destination_id;

grant select on public.location_point_proximity to anon, authenticated;

-- 5. Seed dos terminais do GRU (único multi-terminal hoje). Geo aproximada levantada via
--    Google Maps (jun/2026), refinável no Manager — distância serve pra ordenar/rotular.
--    Lookup por code (não cravar id gerado); on conflict mantém idempotente.
insert into public.destination_point (destination_id, name, type, latitude, longitude, sort_order)
select d.id, v.name, 'terminal', v.lat, v.lng, v.sort
from public.destination d
cross join (values
  ('Terminal 1', -23.4336::numeric, -46.4806::numeric, 1),
  ('Terminal 2', -23.4327::numeric, -46.4730::numeric, 2),
  ('Terminal 3', -23.4316::numeric, -46.4690::numeric, 3)
) as v(name, lat, lng, sort)
where d.code = 'GRU'
on conflict (destination_id, name) do nothing;
