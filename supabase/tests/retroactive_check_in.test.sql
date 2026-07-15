-- pgTAP: bug E2.2.1 — reserva não aceita data/hora de entrada retroativa (check-in no passado).
-- Cobre o piso incondicional em create_booking_atomic, o espelho past_ok em check_availability e a
-- guarda na troca de datas de reserva pendente (change_booking_dates). Roda em transação com rollback.

begin;
select plan(9);

-- ── fixture: customer + um tipo de vaga do seed, capacidade folgada, sem min_stay/min_date ──
do $$
declare
  u uuid := gen_random_uuid();
  v_lpt uuid;
  v_c text; v_l text; v_pt text;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','retro@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;

  select lpt.id, c.slug, l.slug, pt.code
    into v_lpt, v_c, v_l, v_pt
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.capacity > 0 and lpt.is_active and l.deleted_at is null
  limit 1;

  update public.location_parking_type
     set capacity = 50, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;

  perform set_config('test.u', u::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.c', v_c, false);
  perform set_config('test.l', v_l, false);
  perform set_config('test.pt', v_pt, false);
end $$;

-- ── 1) helper check_in_in_past: passado, futuro e dentro da folga (2 min) ──
select is(public.check_in_in_past(now() - interval '1 hour'), true,  'entrada 1h no passado é retroativa');
select is(public.check_in_in_past(now() + interval '1 hour'), false, 'entrada 1h no futuro não é retroativa');
select is(public.check_in_in_past(now() - interval '30 seconds'), false, 'dentro da folga (30s) não é retroativa');

-- ── 2) create_booking_atomic barra data de entrada no passado ──
select throws_ok(
  $$ select public.create_booking_atomic(
       current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
       now() - interval '1 day', now() + interval '1 day') $$,
  'P0001', 'A data e o horário de entrada não podem estar no passado.',
  'create_booking_atomic recusa check-in retroativo');

-- ── 3) create_booking_atomic aceita data de entrada futura ──
select isnt(
  (public.create_booking_atomic(
     current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
     now() + interval '2 days', now() + interval '3 days') ->> 'booking_id'),
  null, 'create_booking_atomic cria reserva com check-in futuro');

-- ── 4) check_availability: past_ok/ok/reason pro período retroativo ──
select is(
  (public.check_availability(current_setting('test.c'), current_setting('test.l'), current_setting('test.pt'),
     now() - interval '1 day', now() + interval '1 day') ->> 'past_ok')::boolean,
  false, 'check_availability marca past_ok=false pro passado');
select is(
  (public.check_availability(current_setting('test.c'), current_setting('test.l'), current_setting('test.pt'),
     now() - interval '1 day', now() + interval '1 day') ->> 'ok')::boolean,
  false, 'check_availability marca ok=false pro passado');
select ok(
  (public.check_availability(current_setting('test.c'), current_setting('test.l'), current_setting('test.pt'),
     now() - interval '1 day', now() + interval '1 day') -> 'reasons') ? 'past',
  'check_availability inclui reason "past"');

-- ── 5) check_availability: past_ok=true pro período futuro ──
select is(
  (public.check_availability(current_setting('test.c'), current_setting('test.l'), current_setting('test.pt'),
     now() + interval '2 days', now() + interval '3 days') ->> 'past_ok')::boolean,
  true, 'check_availability marca past_ok=true pro futuro');

-- ── 6) change_booking_dates barra nova data de entrada no passado ──
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    now() + interval '5 days', now() + interval '6 days');
  perform set_config('test.bk', (r ->> 'booking_id'), false);
end $$;

select throws_ok(
  $$ select public.change_booking_dates(
       current_setting('test.bk')::uuid, now() - interval '1 day', now() + interval '1 day') $$,
  'P0001', 'A data e o horário de entrada não podem estar no passado.',
  'change_booking_dates recusa nova data retroativa');

select * from finish();
rollback;
