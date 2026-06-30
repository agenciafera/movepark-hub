-- pgTAP: E2.8-d — apply_fare_upgrade promove a Tarifa da reserva (preço/janela/benefícios + total).
-- Idempotente; sem downgrade. Transação + rollback.

begin;
select plan(8);

select has_column('public', 'payment', 'kind', 'payment.kind existe');
select has_column('public', 'payment', 'fare_target_tier', 'payment.fare_target_tier existe');
select has_function('public', 'apply_fare_upgrade', 'RPC apply_fare_upgrade existe');

-- fixture: reserva Básica confirmada
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-up@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 10 where id = v_lpt;
  r := public.create_booking_atomic(u, v_lpt, '2026-12-10T12:00:00Z','2026-12-12T12:00:00Z'); -- basica
  update public.booking set status = 'confirmed' where id = (r->>'booking_id')::uuid;
  perform set_config('test.bk', r::text, false);
end $$;

-- total antes (Básica)
select set_config('test.total0',
  (select total_amount::text from public.booking where id = (current_setting('test.bk')::jsonb->>'booking_id')::uuid),
  false);

-- upgrade Básica → Superflex
do $$
begin
  perform public.apply_fare_upgrade((current_setting('test.bk')::jsonb->>'booking_id')::uuid, 'superflex');
end $$;

select is(
  (select fare_tier::text from public.booking where id = (current_setting('test.bk')::jsonb->>'booking_id')::uuid),
  'superflex', 'Tarifa promovida para superflex');
select is(
  (select fare_price_cents from public.booking where id = (current_setting('test.bk')::jsonb->>'booking_id')::uuid),
  2490, 'fare_price_cents = 2490');
select is(
  (select fare_cancel_until from public.booking where id = (current_setting('test.bk')::jsonb->>'booking_id')::uuid),
  '2026-12-10T11:59:00Z'::timestamptz, 'janela recalculada (check_in − 1 min)');
-- total subiu exatamente o delta (24,90 − 0)
select is(
  (select total_amount from public.booking where id = (current_setting('test.bk')::jsonb->>'booking_id')::uuid)
    - current_setting('test.total0')::numeric,
  24.90, 'total subiu o delta do upgrade');

-- idempotência: aplicar de novo não muda nada
do $$
begin
  perform public.apply_fare_upgrade((current_setting('test.bk')::jsonb->>'booking_id')::uuid, 'superflex');
end $$;
select is(
  (select fare_price_cents from public.booking where id = (current_setting('test.bk')::jsonb->>'booking_id')::uuid),
  2490, 'reaplicar é idempotente (sem novo delta)');

select * from finish();
rollback;
