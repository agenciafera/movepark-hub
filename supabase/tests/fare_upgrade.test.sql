-- pgTAP: E2.8-d — apply_fare_upgrade promove a Tarifa da reserva (preço/janela/benefícios + total).
-- Idempotente; sem downgrade; e recusa upgrade fora de prazo ou de status. Transação + rollback.
--
-- Datas são RELATIVAS a now(), de propósito. Desde 20260829000000 a RPC recusa upgrade com check-in
-- vencido (86ajmy41d), então data cravada no futuro vira bomba-relógio: o teste passa hoje e começa
-- a falhar sozinho quando a data chega.

begin;
select plan(10);

select has_column('public', 'payment', 'kind', 'payment.kind existe');
select has_column('public', 'payment', 'fare_target_tier', 'payment.fare_target_tier existe');
select has_function('public', 'apply_fare_upgrade', 'RPC apply_fare_upgrade existe');

-- fixture: reserva Básica confirmada, check-in daqui a 30 dias
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid; r jsonb; v_in timestamptz := date_trunc('minute', now()) + interval '30 days';
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-up@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type
     set capacity = 10, has_minimum_stay = false, has_minimum_date = false where id = v_lpt;
  update public.pricing_rule set advance_booking_minutes = null where location_parking_type_id = v_lpt;
  r := public.create_booking_atomic(u, v_lpt, v_in, v_in + interval '2 days'); -- basica
  update public.booking set status = 'confirmed' where id = (r->>'booking_id')::uuid;
  perform set_config('test.u', u::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.checkin', v_in::text, false);
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
  current_setting('test.checkin')::timestamptz - interval '1 minute', 'janela recalculada (check_in − 1 min)');
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Gates revalidados na RPC (86ajmy41d)
-- Quem aplica o upgrade é o webhook, quando o PIX é pago, e o QR do upgrade vive mais que o hold.
-- Sem estes gates dava para gerar o QR, deixar o check-in passar (ou cancelar) e pagar depois.
-- ─────────────────────────────────────────────────────────────────────────────

-- prazo: check-in já passado
do $$
declare r jsonb; v_in timestamptz := date_trunc('minute', now()) + interval '20 days';
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid, v_in, v_in + interval '2 days');
  update public.booking
     set status = 'confirmed', check_in_at = now() - interval '1 hour'
   where id = (r->>'booking_id')::uuid;
  perform set_config('test.bk_vencida', (r->>'booking_id'), false);
end $$;

select throws_ok(
  format($q$ select public.apply_fare_upgrade(%L::uuid, 'superflex'::public.fare_tier) $q$,
    current_setting('test.bk_vencida')),
  'P0001', NULL,
  'upgrade com check-in já passado é recusado PELA RPC');

-- status: reserva cancelada
do $$
declare r jsonb; v_in timestamptz := date_trunc('minute', now()) + interval '40 days';
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid, v_in, v_in + interval '2 days');
  update public.booking set status = 'cancelled' where id = (r->>'booking_id')::uuid;
  perform set_config('test.bk_cancelada', (r->>'booking_id'), false);
end $$;

select throws_ok(
  format($q$ select public.apply_fare_upgrade(%L::uuid, 'superflex'::public.fare_tier) $q$,
    current_setting('test.bk_cancelada')),
  'P0001', NULL,
  'upgrade em reserva cancelada é recusado PELA RPC');

select * from finish();
rollback;
