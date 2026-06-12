-- DAT-04 — Vínculo location ↔ destination + proximidade (haversine em SQL).
-- O destination é o dono da geo; o lote aponta pra ele via location.destination_id e a
-- proximidade (lote → destino) sai automática por haversine. Sem API externa, sem PostGIS.

-- 1. Haversine em km (fórmula manual). IMMUTABLE: só depende dos argumentos.
create or replace function public.haversine_km(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql immutable set search_path to ''
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else (
      2 * 6371 * asin(sqrt(
        power(sin(radians((lat2 - lat1)::float8) / 2), 2) +
        cos(radians(lat1::float8)) * cos(radians(lat2::float8)) *
        power(sin(radians((lng2 - lng1)::float8) / 2), 2)
      ))
    )::numeric
  end;
$$;

-- 2. Destino publicado mais próximo de um ponto, dentro de um teto (km). null se nenhum.
create or replace function public.nearest_destination(
  p_lat numeric, p_lng numeric, p_max_km numeric default 100
) returns uuid
language sql stable set search_path to 'public'
as $$
  select d.id
  from public.destination d
  where d.is_published = true
    and p_lat is not null and p_lng is not null
    and public.haversine_km(p_lat, p_lng, d.latitude, d.longitude) <= p_max_km
  order by public.haversine_km(p_lat, p_lng, d.latitude, d.longitude) asc
  limit 1;
$$;

-- 3. Coluna + FK + índice. ON DELETE SET NULL: apagar um destino não derruba o lote.
alter table public.location
  add column destination_id uuid references public.destination(id) on delete set null;

create index location_destination_id_idx on public.location (destination_id);

-- 4. Auto-fill no INSERT: lote novo sem destino e com geo → liga no mais próximo.
--    Override manual (destination_id já preenchido) sempre vence; UPDATE nunca é tocado.
create or replace function public.location_set_destination()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.destination_id is null
     and new.latitude is not null and new.longitude is not null then
    new.destination_id := public.nearest_destination(new.latitude, new.longitude);
  end if;
  return new;
end $$;

create trigger location_set_destination_trg
  before insert on public.location
  for each row execute function public.location_set_destination();

-- 5. Backfill dos lotes existentes pelo destino mais próximo (lotes sem geo ficam null).
update public.location l
set destination_id = public.nearest_destination(l.latitude, l.longitude)
where l.deleted_at is null
  and l.destination_id is null
  and l.latitude is not null and l.longitude is not null;

-- 6. View de proximidade — distância on-the-fly (sempre correta, sem cache a invalidar).
--    security_invoker: respeita a RLS de location + destination (ambas legíveis publicamente).
create view public.location_proximity
with (security_invoker = true) as
select
  l.id as location_id,
  l.destination_id,
  d.code as destination_code,
  d.name as destination_name,
  d.short_name as destination_short_name,
  d.type as destination_type,
  round(public.haversine_km(l.latitude, l.longitude, d.latitude, d.longitude), 2) as distance_km
from public.location l
left join public.destination d on d.id = l.destination_id;

grant select on public.location_proximity to anon, authenticated;
