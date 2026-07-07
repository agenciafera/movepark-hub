-- pgTAP: E2.8-e passo 2 — auto-extensão por atraso de voo (extend_booking_flight_delay).
-- Cobre: gate Superflex, extensão de check_out + re-hold de capacidade + log; rejeições. Rollback.

begin;
select plan(10);

select has_table('public', 'booking_fare_extension', 'tabela de log de extensão existe');
select has_function('public', 'extend_booking_flight_delay', 'RPC de extensão existe');

-- ── fixture: um lpt com capacidade + reservas Superflex/Flex confirmadas ─────
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r_super jsonb; r_flex jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-ext@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 10 where id = v_lpt;
  perform set_config('test.lpt', v_lpt::text, false);

  r_super := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z','2026-12-12T12:00:00Z', p_fare_tier => 'superflex');
  r_flex  := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z','2026-12-12T12:00:00Z', p_fare_tier => 'flex');
  update public.booking set status = 'confirmed'
    where id in ((r_super->>'booking_id')::uuid, (r_flex->>'booking_id')::uuid);
  perform set_config('test.super', r_super::text, false);
  perform set_config('test.flex', r_flex::text, false);
end $$;

-- ── extensão Superflex: +1 dia, sem cobrança ────────────────────────────────
do $$
declare v_res jsonb;
begin
  v_res := public.extend_booking_flight_delay(
    (current_setting('test.super')::jsonb->>'booking_id')::uuid,
    '2026-12-13T12:00:00Z', 'customer', 'voo atrasou');
  perform set_config('test.ext', v_res::text, false);
end $$;

select is((current_setting('test.ext')::jsonb->>'added_days')::int, 1, 'extensão de 1 diária adicional');
select is(
  (select check_out_at from public.booking where id = (current_setting('test.super')::jsonb->>'booking_id')::uuid),
  '2026-12-13T12:00:00Z'::timestamptz, 'check_out_at estendido');

-- total NÃO muda (extensão é coberta — sem cobrança)
select is(
  (select total_amount from public.booking where id = (current_setting('test.super')::jsonb->>'booking_id')::uuid),
  (current_setting('test.super')::jsonb->>'total_amount')::numeric, 'total_amount inalterado (sem cobrança)');

-- capacidade re-segurada na data adicionada (Dec 13)
select cmp_ok(
  (select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-12-13'),
  '>=', 1, 'capacidade segurada na data adicionada');

-- log registrado
select is(
  (select count(*)::int from public.booking_fare_extension
   where booking_id = (current_setting('test.super')::jsonb->>'booking_id')::uuid),
  1, 'extensão registrada no log');

-- ── rejeições ───────────────────────────────────────────────────────────────
-- Flex não tem proteção contra atraso de voo
select throws_ok(
  format($$ select public.extend_booking_flight_delay(%L::uuid, '2026-12-13T12:00:00Z') $$,
         (current_setting('test.flex')::jsonb->>'booking_id')),
  'P0001', null, 'Flex não pode estender (só Superflex)');

-- nova saída não pode ser <= atual
select throws_ok(
  format($$ select public.extend_booking_flight_delay(%L::uuid, '2026-12-13T12:00:00Z') $$,
         (current_setting('test.super')::jsonb->>'booking_id')),
  'P0001', null, 'nova saída <= atual é rejeitada (já estendido até 13)');

-- reserva inexistente
select throws_ok(
  $$ select public.extend_booking_flight_delay(gen_random_uuid(), '2026-12-20T12:00:00Z') $$,
  'P0001', null, 'reserva inexistente é rejeitada');

select * from finish();
rollback;
