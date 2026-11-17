-- pgTAP: reembolso manual parcial (migration 20261204150000). A troca de datas mais barata põe na
-- fila só as diárias; marcar como pago não pode dar a cobrança inteira como estornada.
begin;
select plan(5);

do $$
declare u uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); v_lpt uuid; r jsonb; v_pay uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manual-parcial@ex.com', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manual-parcial-adm@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer'), (adm, 'hub_admin')
    on conflict (id) do update set role = excluded.role;
  select lpt.id into v_lpt
  from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
  where lpt.capacity > 0 and lpt.is_active and l.deleted_at is null
  order by (l.checkout_mode::text = 'hub') desc, (l.is_listed is true) desc, lpt.created_at limit 1;
  update public.location_parking_type set capacity = 10, has_minimum_stay = false where id = v_lpt;
  r := public.create_booking_atomic(u, v_lpt, '2027-03-10T12:00:00Z', '2027-03-15T12:00:00Z');
  insert into public.payment (id, booking_id, provider, amount, status, kind, method, paid_at)
    values (v_pay, (r ->> 'booking_id')::uuid, 'pagarme', 157.40, 'paid', 'booking', 'pix', now());
  insert into public.payout_refund_manual (booking_id, payment_id, amount_cents, reason, status)
    values ((r ->> 'booking_id')::uuid, v_pay, 5780, 'gateway_refused', 'pending');
  perform set_config('test.pay', v_pay::text, false);
  perform set_config('test.bid', r ->> 'booking_id', false);
  perform set_config('request.jwt.claim.sub', adm::text, false);
end $$;

select lives_ok(
  $$ select public.payout_refund_manual_mark_paid(
       (select id from public.payout_refund_manual where payment_id = current_setting('test.pay')::uuid)) $$,
  'hub_admin marca a devolução parcial como paga');
select is((select refunded_amount from public.payment where id = current_setting('test.pay')::uuid),
  57.80::numeric, 'soma só o que a linha devolveu');
select is((select status::text from public.payment where id = current_setting('test.pay')::uuid),
  'paid', 'devolução parcial não dá a cobrança como estornada');

-- O resto (cancelamento depois) completa o total e aí sim vira estornado.
insert into public.payout_refund_manual (booking_id, payment_id, amount_cents, reason, status)
  values (current_setting('test.bid')::uuid, current_setting('test.pay')::uuid, 9960, 'gateway_refused', 'pending');
select lives_ok(
  $$ select public.payout_refund_manual_mark_paid(
       (select id from public.payout_refund_manual where payment_id = current_setting('test.pay')::uuid and status = 'pending')) $$,
  'marca a segunda devolução');
select is((select status::text || ' ' || refunded_amount::text from public.payment where id = current_setting('test.pay')::uuid),
  'refunded 157.40', 'completou o total: estornado com o valor cheio');

select * from finish();
rollback;
