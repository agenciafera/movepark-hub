-- E3.6 (recorte) — "N reservaram hoje": sinal de demanda honesto, sem número.
--
-- A E3.6 original pedia expor a contagem literal ("3 pessoas reservaram hoje"), mas isso
-- conflita com a decisão já tomada em `popular_locations` (20260716000000): nunca vazar o
-- número bruto de reservas por lote publicamente (dá pra inferir receita/volume de um
-- parceiro concorrente). Este RPC segue o mesmo padrão — devolve só os `location_id` que
-- cruzaram o limiar, nunca a contagem — e vira um badge qualitativo ("Muito procurado
-- hoje"), não um número.
--
-- "Hoje" é o dia civil na timezone da própria location (`location.timezone`), não UTC —
-- importante pra não considerar reservas de ontem/amanhã perto da virada do dia.
-- Conta só reserva paga de verdade: confirmed/checked_in/completed/no_show (mesmo status
-- de "vendido" usado em popular_locations) — pending/cancelled não são dado real.
-- Limiar em app_setting (config dinâmica, sem redeploy) — ver 20260716000000_chatbot_settings.sql.

insert into public.app_setting (key, value) values
  ('high_demand_min_bookings_today', '3')
on conflict (key) do nothing;

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
    and b.deleted_at is null
    and b.status in ('confirmed', 'checked_in', 'completed', 'no_show')
    and b.created_at >= date_trunc('day', now() at time zone l.timezone) at time zone l.timezone
  group by b.location_id
  having count(*) >= coalesce((select v from threshold), 3);
$$;

revoke all on function public.locations_high_demand_today(uuid[]) from public;
grant execute on function public.locations_high_demand_today(uuid[]) to anon, authenticated, service_role;
