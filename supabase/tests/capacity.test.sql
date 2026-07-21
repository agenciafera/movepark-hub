-- pgTAP: reserva + capacidade (create_booking_atomic / release_booking_capacity).
-- Hold atômico: cada data da estadia incrementa location_parking_availability.booked_count;
-- se booked_count >= capacity → erro. Roda em transação com rollback.

begin;
select plan(11);

-- ── fixture: DOIS customers + um tipo de vaga do seed com capacidade = 1 ────
-- O 2º cliente existe porque create_booking_atomic deduplica por (cliente + compra): repetir a
-- mesma chamada com o MESMO cliente devolve replay da pending e nunca chega no guard que se quer
-- testar. Um segundo cliente disputando a mesma vaga é o modelo real da capacidade. Ver 86ajmycpc.
do $$
declare u uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cap@ex.com',now(),now()),
           (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','cap2@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer'), (u2,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 1 where id = v_lpt;  -- força capacidade 1
  perform set_config('test.u', u::text, false);
  perform set_config('test.u2', u2::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- ── 1) happy path: cria reserva (datas 10-12/set) ──────────────────────────
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-09-10T12:00:00Z', '2026-09-12T12:00:00Z');
  perform set_config('test.bk', r::text, false);
end $$;

select ok((current_setting('test.bk')::jsonb->>'code') is not null, 'reserva criada tem code');
select ok((current_setting('test.bk')::jsonb->>'booking_id') is not null, 'reserva tem booking_id');
select cmp_ok((current_setting('test.bk')::jsonb->>'total_amount')::numeric, '>', 0::numeric, 'total_amount > 0');
select is((current_setting('test.bk')::jsonb->>'days')::int, 2, 'days = 2 (10→12)');

-- booked_count = 1 na primeira data
select is(
  (select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-09-10'),
  1, 'booked_count incrementado para 1');

-- ── 2) capacidade esgotada: 2ª reserva nas MESMAS datas → erro ─────────────
select throws_ok(
  format($q$ select public.create_booking_atomic(%L::uuid, %L::uuid,
    '2026-09-10T12:00:00Z'::timestamptz, '2026-09-12T12:00:00Z'::timestamptz) $q$,
    current_setting('test.u2'), current_setting('test.lpt')),
  'P0001', NULL,
  'segunda reserva nas mesmas datas é bloqueada por capacidade');

-- ── 3) release devolve a capacidade ────────────────────────────────────────
do $$
begin
  perform public.release_booking_capacity((current_setting('test.bk')::jsonb->>'booking_id')::uuid);
end $$;

select is(
  coalesce((select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-09-10'), 0),
  0, 'release_booking_capacity zera o booked_count');

-- ── 4) estadia mínima bloqueia a reserva ───────────────────────────────────
update public.location_parking_type
   set has_minimum_stay = true, minimum_stay_value = 5, minimum_stay_unit = 'days'
 where id = current_setting('test.lpt')::uuid;

select throws_ok(
  format($q$ select public.create_booking_atomic(%L::uuid, %L::uuid,
    '2026-09-10T12:00:00Z'::timestamptz, '2026-09-12T12:00:00Z'::timestamptz) $q$,
    current_setting('test.u2'), current_setting('test.lpt')),
  'P0001', NULL,
  'estadia abaixo do mínimo é bloqueada');

update public.location_parking_type set has_minimum_stay = false where id = current_setting('test.lpt')::uuid;

-- ── 5) data mínima de entrada bloqueia a reserva ───────────────────────────
update public.location_parking_type
   set has_minimum_date = true, minimum_date = '2027-01-01'
 where id = current_setting('test.lpt')::uuid;

select throws_ok(
  format($q$ select public.create_booking_atomic(%L::uuid, %L::uuid,
    '2026-09-10T12:00:00Z'::timestamptz, '2026-09-12T12:00:00Z'::timestamptz) $q$,
    current_setting('test.u2'), current_setting('test.lpt')),
  'P0001', NULL,
  'entrada antes da data mínima é bloqueada');

update public.location_parking_type set has_minimum_date = false where id = current_setting('test.lpt')::uuid;

-- ── 6) expiração de pending abandonado libera o hold e cancela ─────────────
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-09-25T12:00:00Z', '2026-09-27T12:00:00Z');
  -- backdata o vencimento p/ simular abandono
  update public.booking set expires_at = now() - interval '1 hour'
   where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.exp', r::text, false);
  perform public.cron_expire_pending_bookings();
end $$;

select is(
  coalesce((select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-09-25'), 0),
  0, 'cron_expire_pending_bookings devolve a vaga');

select is(
  (select status::text from public.booking
   where id = (current_setting('test.exp')::jsonb ->> 'booking_id')::uuid),
  'cancelled', 'cron_expire_pending_bookings marca a reserva como cancelled');

select * from finish();
rollback;
