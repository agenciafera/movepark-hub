-- Fix de segurança (revisão pós-deploy da E3.6/high_demand_signal): locations_high_demand_today
-- não filtrava location.status/deleted_at.
--
-- SECURITY DEFINER contorna RLS — a policy `catalog_read_location` é o que normalmente esconde
-- de `anon`/`authenticated` uma location inativa/excluída/de empresa suspensa; dentro de uma
-- função SECURITY DEFINER ela precisa ser reaplicada manualmente. `popular_locations`
-- (20260716000000) já faz isso corretamente — esta função ficou sem o mesmo filtro, permitindo
-- que quem já conhecesse o location_id de uma location que virou inativa/excluída continuasse
-- extraindo o sinal de demanda dela via chamada direta ao RPC (anon tem EXECUTE), driblando o
-- filtro que a edge `search` já aplica antes de repassar IDs.

create or replace function public.locations_high_demand_today(p_location_ids uuid[])
returns table (location_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  with threshold as (
    select coalesce(nullif(value, '')::int, 3) as v
    from public.app_setting where key = 'high_demand_min_bookings_today'
  )
  select b.location_id
  from public.booking b
  join public.location l on l.id = b.location_id
  where b.location_id = any(p_location_ids)
    and l.status = 'active' and l.deleted_at is null
    and b.deleted_at is null
    and b.status in ('confirmed', 'checked_in', 'completed', 'no_show')
    and b.created_at >= date_trunc('day', now() at time zone l.timezone) at time zone l.timezone
  group by b.location_id
  having count(*) >= coalesce((select v from threshold), 3);
$$;
