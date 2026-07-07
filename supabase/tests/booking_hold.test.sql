-- pgTAP: E0.3.1-a — janela de expiração configurável + blindagem do cron (ADR-005).
-- Cobre: helpers de config (default/clamp), renovação do hold no core, cron reconciliando contra
-- payment (não cancela pagamento comprometido, cancela PIX ocioso), grace, e confirm_or_refund_booking
-- (confirmed / reconfirmed / needs_refund). Roda em transação com rollback.

begin;
select plan(19);

-- ── fixture: customer + um tipo de vaga do seed com capacidade = 1 ──────────
do $$
declare u uuid := gen_random_uuid(); v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hold@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 1, has_minimum_stay = false, has_minimum_date = false
   where id = v_lpt;
  perform set_config('test.u', u::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- ── 1) helpers de config: default + clamp ──────────────────────────────────
select is(public.get_booking_hold_minutes(), 30, 'hold default = 30');
select is(public.get_booking_hold_grace_minutes(), 2, 'grace default = 2');

update public.app_setting set value = '1' where key = 'booking_hold_minutes';
select is(public.get_booking_hold_minutes(), 5, 'hold clampa abaixo do mínimo (1 → 5)');
update public.app_setting set value = '99999' where key = 'booking_hold_minutes';
select is(public.get_booking_hold_minutes(), 1440, 'hold clampa acima do máximo (99999 → 1440)');

-- ── 2) _create_booking_core usa a config (hold = 45) ───────────────────────
update public.app_setting set value = '45' where key = 'booking_hold_minutes';
do $$
declare r jsonb;
begin
  r := public.create_booking_atomic(
    current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z');
  perform set_config('test.bk_hold', r::text, false);
end $$;

select ok(
  (select expires_at from public.booking
   where id = (current_setting('test.bk_hold')::jsonb ->> 'booking_id')::uuid)
    between now() + interval '44 minutes' and now() + interval '46 minutes',
  'reserva nasce com expires_at ≈ now()+45min (config única)');

-- volta o hold p/ 30 no restante
update public.app_setting set value = '30' where key = 'booking_hold_minutes';

-- ── 3) cron NÃO cancela reserva com pagamento comprometido ─────────────────
-- 3a) cartão em análise (authorized)
do $$
declare r jsonb; v_bk uuid;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-05T12:00:00Z', '2026-10-06T12:00:00Z');
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set expires_at = now() - interval '1 hour' where id = v_bk;
  insert into public.payment(booking_id, provider, method, amount, status, provider_charge_id)
    values (v_bk, 'pagarme', 'card', 10, 'authorized', 'ch_auth');
  perform public.cron_expire_pending_bookings();
  perform set_config('test.bk_auth', v_bk::text, false);
end $$;

select is(
  (select status::text from public.booking where id = current_setting('test.bk_auth')::uuid),
  'pending', 'cron NÃO cancela reserva com cartão authorized');

-- 3b) pagamento pago
do $$
declare r jsonb; v_bk uuid;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-08T12:00:00Z', '2026-10-09T12:00:00Z');
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set expires_at = now() - interval '1 hour' where id = v_bk;
  insert into public.payment(booking_id, provider, method, amount, status, provider_charge_id)
    values (v_bk, 'pagarme', 'pix', 10, 'paid', 'ch_paid');
  perform public.cron_expire_pending_bookings();
  perform set_config('test.bk_paid', v_bk::text, false);
end $$;

select is(
  (select status::text from public.booking where id = current_setting('test.bk_paid')::uuid),
  'pending', 'cron NÃO cancela reserva com pagamento paid');

-- ── 4) cron CANCELA PIX ocioso (pix/pending) e libera a capacidade ─────────
do $$
declare r jsonb; v_bk uuid;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-11T12:00:00Z', '2026-10-12T12:00:00Z');
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set expires_at = now() - interval '1 hour' where id = v_bk;
  insert into public.payment(booking_id, provider, method, amount, status, provider_charge_id)
    values (v_bk, 'pagarme', 'pix', 10, 'pending', 'ch_idle');
  perform public.cron_expire_pending_bookings();
  perform set_config('test.bk_idle', v_bk::text, false);
end $$;

select is(
  (select status::text from public.booking where id = current_setting('test.bk_idle')::uuid),
  'cancelled', 'cron cancela PIX apenas gerado e não pago (ocioso)');
select is(
  coalesce((select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-10-11'), 0),
  0, 'cron libera a capacidade do PIX ocioso');

-- ── 5) grace: dentro do grace NÃO expira; além do grace expira ─────────────
do $$
declare r jsonb; v_bk uuid;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-15T12:00:00Z', '2026-10-16T12:00:00Z');
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set expires_at = now() - interval '1 minute' where id = v_bk;  -- < grace (2min)
  perform public.cron_expire_pending_bookings();
  perform set_config('test.bk_grace', v_bk::text, false);
end $$;

select is(
  (select status::text from public.booking where id = current_setting('test.bk_grace')::uuid),
  'pending', 'dentro do grace (expirou há 1min) NÃO cancela');

do $$
begin
  update public.booking set expires_at = now() - interval '10 minutes'
   where id = current_setting('test.bk_grace')::uuid;  -- > grace
  perform public.cron_expire_pending_bookings();
end $$;

select is(
  (select status::text from public.booking where id = current_setting('test.bk_grace')::uuid),
  'cancelled', 'além do grace (expirou há 10min) cancela');

-- ── 6) confirm_or_refund_booking: os 3 outcomes ────────────────────────────
-- 6a) pending → confirmed
do $$
declare r jsonb; v_bk uuid; v_pay uuid; res jsonb;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-20T12:00:00Z', '2026-10-21T12:00:00Z');
  v_bk := (r ->> 'booking_id')::uuid;
  insert into public.payment(booking_id, provider, method, amount, status, provider_charge_id)
    values (v_bk, 'pagarme', 'card', 10, 'paid', 'ch_6a') returning id into v_pay;
  res := public.confirm_or_refund_booking(v_bk, v_pay);
  perform set_config('test.bk_6a', v_bk::text, false);
  perform set_config('test.res_6a', res::text, false);
end $$;

select is(current_setting('test.res_6a')::jsonb ->> 'outcome', 'confirmed', '6a: pending → outcome confirmed');
select is(
  (select status::text from public.booking where id = current_setting('test.bk_6a')::uuid),
  'confirmed', '6a: reserva vira confirmed');

-- 6b) cancelled COM vaga → reconfirmed (re-adquire capacidade)
do $$
declare r jsonb; v_bk uuid; v_pay uuid; res jsonb;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-22T12:00:00Z', '2026-10-23T12:00:00Z');
  v_bk := (r ->> 'booking_id')::uuid;
  insert into public.payment(booking_id, provider, method, amount, status, provider_charge_id)
    values (v_bk, 'pagarme', 'pix', 10, 'paid', 'ch_6b') returning id into v_pay;
  perform public.cancel_booking_with_release(v_bk, 'teste');  -- cancela + libera vaga
  res := public.confirm_or_refund_booking(v_bk, v_pay);       -- vaga livre → reconfirma
  perform set_config('test.bk_6b', v_bk::text, false);
  perform set_config('test.res_6b', res::text, false);
end $$;

select is(current_setting('test.res_6b')::jsonb ->> 'outcome', 'reconfirmed', '6b: cancelled com vaga → reconfirmed');
select is(
  (select status::text from public.booking where id = current_setting('test.bk_6b')::uuid),
  'confirmed', '6b: reserva reconfirmada vira confirmed');
select is(
  (select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-10-22'),
  1, '6b: capacidade re-adquirida na reconfirmação');

-- 6c) cancelled SEM vaga → needs_refund (outra reserva tomou a vaga)
do $$
declare r_b jsonb; v_b uuid; v_pay uuid; r_a jsonb; res jsonb;
begin
  -- B segura a vaga, é paga e depois cancelada (libera)
  r_b := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-25T12:00:00Z', '2026-10-26T12:00:00Z');
  v_b := (r_b ->> 'booking_id')::uuid;
  insert into public.payment(booking_id, provider, method, amount, status, provider_charge_id)
    values (v_b, 'pagarme', 'card', 10, 'paid', 'ch_6c') returning id into v_pay;
  perform public.cancel_booking_with_release(v_b, 'teste');   -- libera a vaga
  -- A toma a única vaga das mesmas datas
  r_a := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    '2026-10-25T12:00:00Z', '2026-10-26T12:00:00Z');
  -- confirmação tardia de B: vaga cheia (A ocupa) → needs_refund
  res := public.confirm_or_refund_booking(v_b, v_pay);
  perform set_config('test.res_6c', res::text, false);
end $$;

select is(current_setting('test.res_6c')::jsonb ->> 'outcome', 'needs_refund', '6c: cancelled sem vaga → needs_refund');
select is(current_setting('test.res_6c')::jsonb ->> 'charge_id', 'ch_6c', '6c: needs_refund traz o charge_id p/ estorno');

select * from finish();
rollback;
