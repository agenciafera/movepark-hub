-- ADR-001 — Geo no banco com PostGIS.
-- Toda distância/proximidade ("mais próximo", raio) é calculada no Postgres com PostGIS
-- (geography(Point), ST_Distance/ST_DWithin, índice GiST) — NUNCA no frontend.
-- Esta migration migra DAT-04 (lote↔destino) e DAT-05 (terminais) do haversine manual em SQL
-- para PostGIS, e remove o cálculo espelhado em TS do Edge `search` (vira a RPC locations_proximity).
-- ST_Distance em geography devolve metros corretos (curvatura) — sem haversine na mão.

create extension if not exists postgis with schema extensions;

-- A expressão da coluna gerada é resolvida e armazenada no momento do ALTER; garantir que as
-- funções/tipos do PostGIS (schema extensions) estejam visíveis aqui.
set search_path = public, extensions;

-- ── 1. Colunas geográficas geradas (geography(Point,4326)) + índices GiST ─────────────────
-- geography deriva de latitude/longitude; null quando faltar geo. STORED: materializada e indexável.

alter table public.destination
  add column geog extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored;

alter table public.location
  add column geog extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored;

alter table public.destination_point
  add column geog extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored;

create index destination_geog_idx on public.destination using gist (geog);
create index location_geog_idx on public.location using gist (geog);
create index destination_point_geog_idx on public.destination_point using gist (geog);

-- ── 2. nearest_destination — destino publicado mais próximo (PostGIS) ──────────────────────
-- ST_DWithin filtra pelo teto (metros); ordena pela distância geográfica (usa o GiST).
create or replace function public.nearest_destination(
  p_lat numeric, p_lng numeric, p_max_km numeric default 100
) returns uuid
language sql stable set search_path to public, extensions
as $$
  select d.id
  from public.destination d
  where d.is_published = true
    and p_lat is not null and p_lng is not null
    and st_dwithin(
      d.geog,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_max_km * 1000
    )
  order by st_distance(
    d.geog,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  ) asc
  limit 1;
$$;

-- ── 3. nearest_destination_point — terminal mais próximo de um destino (PostGIS) ───────────
create or replace function public.nearest_destination_point(
  p_lat numeric, p_lng numeric, p_destination_id uuid
) returns uuid
language sql stable set search_path to public, extensions
as $$
  select dp.id
  from public.destination_point dp
  where dp.destination_id = p_destination_id
    and p_lat is not null and p_lng is not null
  order by st_distance(
    dp.geog,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  ) asc
  limit 1;
$$;

-- ── 4. Views de proximidade — distância via ST_Distance (metros → km) ─────────────────────
-- security_invoker: respeita a RLS de location/destination/destination_point (todas públicas).
create or replace view public.location_proximity
with (security_invoker = true) as
select
  l.id as location_id,
  l.destination_id,
  d.code as destination_code,
  d.name as destination_name,
  d.short_name as destination_short_name,
  d.type as destination_type,
  round((extensions.st_distance(l.geog, d.geog) / 1000.0)::numeric, 2) as distance_km
from public.location l
left join public.destination d on d.id = l.destination_id;

grant select on public.location_proximity to anon, authenticated;

create or replace view public.location_point_proximity
with (security_invoker = true) as
select
  l.id as location_id,
  l.destination_id,
  dp.id as destination_point_id,
  dp.name as point_name,
  dp.type as point_type,
  dp.sort_order,
  round((extensions.st_distance(l.geog, dp.geog) / 1000.0)::numeric, 2) as distance_km,
  (dp.id = public.nearest_destination_point(l.latitude, l.longitude, l.destination_id)) as is_nearest
from public.location l
join public.destination_point dp on dp.destination_id = l.destination_id;

grant select on public.location_point_proximity to anon, authenticated;

-- ── 5. RPC locations_proximity — proximidade de TODOS os lotes a um ponto buscado ─────────
-- Usada pelo Edge `search`: dado o ponto do destino (lat/lng) e, opcionalmente, o destino,
-- devolve por lote a distância ao centro e o terminal mais próximo daquele destino. Tudo no
-- banco (PostGIS) — o Edge só repassa; nada de haversine no frontend.
create or replace function public.locations_proximity(
  p_lat numeric, p_lng numeric, p_destination_id uuid default null
) returns table (
  location_id uuid,
  distance_km numeric,
  nearest_terminal_name text,
  nearest_terminal_distance_km numeric
)
language sql stable set search_path to public, extensions
as $$
  with target as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select
    l.id,
    round((st_distance(l.geog, t.g) / 1000.0)::numeric, 2),
    np.name,
    np.dist
  from public.location l
  cross join target t
  left join lateral (
    select dp.name,
           round((st_distance(l.geog, dp.geog) / 1000.0)::numeric, 2) as dist
    from public.destination_point dp
    where p_destination_id is not null
      and dp.destination_id = p_destination_id
    order by st_distance(l.geog, dp.geog) asc
    limit 1
  ) np on true
  where l.deleted_at is null
    and l.geog is not null
    and p_lat is not null
    and p_lng is not null;
$$;

grant execute on function public.locations_proximity(numeric, numeric, uuid) to anon, authenticated;

-- ── 6. Remover o haversine manual — já não tem dependentes (ADR-001: só PostGIS) ──────────
drop function if exists public.haversine_km(numeric, numeric, numeric, numeric);
