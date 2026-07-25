-- pgTAP: status `expired` (abandono) vs `cancelled` (cancelamento real).
-- Regra: `expired` = reserva encerrada que NUNCA foi paga (carrinho abandonado);
-- `cancelled` = reserva paga e depois cancelada. O determinante é o PAGAMENTO, não o status
-- (cobre a janela paga-mas-ainda-pending). Ver docs/specs/booking-flow.md (Abandono vs cancelamento).
-- Transação com rollback.

begin;
select plan(12);

-- ── o enum ganhou o valor `expired` ─────────────────────────────────────────
select ok(
  'expired' = any (enum_range(null::public.booking_status)::text[]),
  'booking_status inclui expired');

-- ── fixture: 1 lpt com capacidade 5 + 4 reservas em datas distintas ──────────
-- create_booking_atomic deduplica por (cliente + compra), então cada reserva usa um cliente e
-- datas próprias (evita replay e colisão de disponibilidade). Ver payment_refund.test.sql.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  v_lpt uuid; a jsonb; b jsonb; c jsonb; d jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exp1@ex.com',now(),now()),
    (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exp2@ex.com',now(),now()),
    (u3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exp3@ex.com',now(),now()),
    (u4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exp4@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (u1,'customer'),(u2,'customer'),(u3,'customer'),(u4,'customer') on conflict (id) do nothing;

  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 5 where id = v_lpt;

  a := public.create_booking_atomic(u1, v_lpt, '2026-12-01T12:00:00Z', '2026-12-02T12:00:00Z');
  b := public.create_booking_atomic(u2, v_lpt, '2026-12-05T12:00:00Z', '2026-12-06T12:00:00Z');
  c := public.create_booking_atomic(u3, v_lpt, '2026-12-10T12:00:00Z', '2026-12-11T12:00:00Z');
  d := public.create_booking_atomic(u4, v_lpt, '2026-12-15T12:00:00Z', '2026-12-16T12:00:00Z');

  -- A (cron, abandonada) e B (cron, mas PAGA): expires_at no passado para o cron enxergar as duas.
  update public.booking set expires_at = now() - interval '1 hour'
    where id in ((a ->> 'booking_id')::uuid, (b ->> 'booking_id')::uuid);
  -- B teve pagamento: o cron NÃO pode expirá-la (deve confirmar, não abandonar).
  insert into public.payment (booking_id, provider, amount, status, paid_at)
    values ((b ->> 'booking_id')::uuid, 'mock', 100, 'paid', now());
  -- D foi paga: cancelar D é cancelamento real (cancelled), não abandono.
  insert into public.payment (booking_id, provider, amount, status, paid_at)
    values ((d ->> 'booking_id')::uuid, 'mock', 100, 'paid', now());

  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.a', (a ->> 'booking_id'), false);
  perform set_config('test.b', (b ->> 'booking_id'), false);
  perform set_config('test.c', (c ->> 'booking_id'), false);
  perform set_config('test.d', (d ->> 'booking_id'), false);
end $$;

-- ── cron: expira pending abandonado (não pago) ──────────────────────────────
select ok(
  public.cron_expire_pending_bookings() >= 1,
  'cron expira ao menos a reserva abandonada');

select is(
  (select status::text from public.booking where id = current_setting('test.a')::uuid),
  'expired', 'A (pending, não paga, vencida) → expired');

select is(
  coalesce((select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-12-01'), 0),
  0, 'expirar A liberou a capacidade da data dela');

-- ── cron NÃO expira pending que já foi pago (janela pré-confirmação) ─────────
select is(
  (select status::text from public.booking where id = current_setting('test.b')::uuid),
  'pending', 'B (pending, PAGA, vencida) NÃO é expirada pelo cron');

select is(
  coalesce((select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-12-05'), 0),
  1, 'B paga mantém a capacidade reservada');

-- ── cancel de pending não paga → expired ────────────────────────────────────
select is(
  public.cancel_booking_with_release(current_setting('test.c')::uuid, 'teste'),
  'expired'::public.booking_status, 'cancelar pending não paga retorna expired');

select is(
  (select status::text from public.booking where id = current_setting('test.c')::uuid),
  'expired', 'C marcada como expired');

select is(
  coalesce((select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-12-10'), 0),
  0, 'cancelar C liberou a capacidade');

-- ── cancel de reserva PAGA → cancelled (cancelamento real) ──────────────────
select is(
  public.cancel_booking_with_release(current_setting('test.d')::uuid, 'teste'),
  'cancelled'::public.booking_status, 'cancelar reserva paga retorna cancelled');

select is(
  (select status::text from public.booking where id = current_setting('test.d')::uuid),
  'cancelled', 'D marcada como cancelled');

-- ── idempotência: expirada é terminal → noop retorna expired ────────────────
select is(
  public.cancel_booking_with_release(current_setting('test.c')::uuid, 'denovo'),
  'expired'::public.booking_status, 'segunda chamada em C é noop e retorna expired');

select * from finish();
rollback;
