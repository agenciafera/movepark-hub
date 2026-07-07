-- pgTAP: locations_high_demand_today (E3.6, recorte "N reservaram hoje" sem número).
-- Nunca deve devolver contagem — só os location_id que cruzaram o limiar de
-- app_setting.high_demand_min_bookings_today (default 3). Roda em transação com rollback.
-- Fixture cria sua própria company/location (não depende do seed) pra isolar as contagens.

begin;
select plan(8);

select has_function(
  'public', 'locations_high_demand_today', ARRAY['uuid[]'],
  'locations_high_demand_today(uuid[]) existe');
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'locations_high_demand_today'),
  true, 'locations_high_demand_today é SECURITY DEFINER');
select ok(
  has_function_privilege('anon', 'public.locations_high_demand_today(uuid[])', 'EXECUTE'),
  'anon tem EXECUTE em locations_high_demand_today');

-- ── fixture: customer + company/location próprios (timezone default America/Sao_Paulo) ──
do $$
declare u uuid := gen_random_uuid(); v_company uuid; v_loc uuid; v_loc2 uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','demand@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;

  insert into public.company (name, slug) values ('Demand Test Co', 'demand-test-co-' || u) returning id into v_company;
  insert into public.location (company_id, name, slug) values (v_company, 'Demand Loc 1', 'demand-loc-1-' || u) returning id into v_loc;
  insert into public.location (company_id, name, slug) values (v_company, 'Demand Loc 2', 'demand-loc-2-' || u) returning id into v_loc2;

  perform set_config('test.u', u::text, false);
  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.loc2', v_loc2::text, false);
end $$;

-- 2 reservas "vendidas" hoje — abaixo do limiar (3)
insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, created_at)
select 'MP-DEM' || i, current_setting('test.u')::uuid, current_setting('test.loc')::uuid,
       now() + interval '1 day', now() + interval '2 days', 'confirmed', 100, now()
from generate_series(1, 2) i;

select ok(
  not exists(
    select 1 from public.locations_high_demand_today(array[current_setting('test.loc')::uuid])
    where location_id = current_setting('test.loc')::uuid
  ),
  '2 reservas hoje (abaixo do limiar 3) não aciona o sinal');

-- 3ª reserva hoje → cruza o limiar
insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, created_at)
values ('MP-DEM3', current_setting('test.u')::uuid, current_setting('test.loc')::uuid,
        now() + interval '1 day', now() + interval '2 days', 'confirmed', 100, now());

select ok(
  exists(
    select 1 from public.locations_high_demand_today(array[current_setting('test.loc')::uuid])
    where location_id = current_setting('test.loc')::uuid
  ),
  '3ª reserva hoje cruza o limiar e aciona o sinal');

select is(
  (select count(*)::int from public.locations_high_demand_today(array[current_setting('test.loc')::uuid])),
  1, 'devolve só o location_id — nunca a contagem de reservas');

-- reserva cancelada não conta como demanda real (location 2, isolada)
insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, created_at)
select 'MP-DEMC' || i, current_setting('test.u')::uuid, current_setting('test.loc2')::uuid,
       now() + interval '1 day', now() + interval '2 days', 'cancelled', 100, now()
from generate_series(1, 5) i;

select ok(
  not exists(
    select 1 from public.locations_high_demand_today(array[current_setting('test.loc2')::uuid])
    where location_id = current_setting('test.loc2')::uuid
  ),
  '5 reservas cancelled não acionam o sinal (não é dado real de demanda)');

-- reserva de 2 dias atrás não conta pra "hoje" (mesma location 2, agora com confirmed antigas)
insert into public.booking (code, profile_id, location_id, check_in_at, check_out_at, status, total_amount, created_at)
select 'MP-DEMY' || i, current_setting('test.u')::uuid, current_setting('test.loc2')::uuid,
       now() + interval '1 day', now() + interval '2 days', 'confirmed', 100, now() - interval '2 days'
from generate_series(1, 5) i;

select ok(
  not exists(
    select 1 from public.locations_high_demand_today(array[current_setting('test.loc2')::uuid])
    where location_id = current_setting('test.loc2')::uuid
  ),
  'reservas confirmed de 2 dias atrás não contam pra "hoje" (dia civil na timezone da location)');

select * from finish();
rollback;
