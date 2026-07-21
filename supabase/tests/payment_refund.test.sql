-- pgTAP: E0.3.2 — estorno. Colunas de refund no payment, idempotência de
-- cancel_booking_with_release (REGRESSÃO: nunca libera capacidade 2x) e RLS de escrita do payment.
-- Transação com rollback.

begin;
select plan(11);

-- ── colunas novas ──────────────────────────────────────────────────────────
select has_column('public', 'payment', 'provider_charge_id', 'payment.provider_charge_id existe');
select has_column('public', 'payment', 'refunded_amount', 'payment.refunded_amount existe');
select has_column('public', 'payment', 'refunded_at', 'payment.refunded_at existe');
select has_column('public', 'payment', 'refund_reason', 'payment.refund_reason existe');

-- ── fixture: customer + lpt com capacidade 5 + DUAS reservas nas mesmas datas ─
-- Duas reservas nas mesmas datas exigem DOIS clientes: create_booking_atomic deduplica por
-- (cliente + compra), então o mesmo cliente repetindo a chamada receberia replay da 1ª em vez de
-- uma reserva nova, e o booked_count ficaria em 1. Ver 86ajmycpc.
do $$
declare u uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); v_lpt uuid; a jsonb; b jsonb; v_pay uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','refund@ex.com',now(),now()),
           (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','refund2@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer'), (u2,'customer') on conflict (id) do nothing;
  select id into v_lpt from public.location_parking_type where capacity > 0 and is_active limit 1;
  update public.location_parking_type set capacity = 5 where id = v_lpt;

  a := public.create_booking_atomic(u,  v_lpt, '2026-11-10T12:00:00Z', '2026-11-12T12:00:00Z');
  b := public.create_booking_atomic(u2, v_lpt, '2026-11-10T12:00:00Z', '2026-11-12T12:00:00Z');

  -- payment pago para a reserva A (testa RLS de escrita)
  insert into public.payment (booking_id, provider, amount, status)
    values ((a ->> 'booking_id')::uuid, 'mock', 100, 'paid')
    returning id into v_pay;

  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.a', a::text, false);
  perform set_config('test.b', b::text, false);
  perform set_config('test.pay', v_pay::text, false);
end $$;

-- duas reservas seguram a vaga → booked_count = 2
select is(
  (select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-11-10'),
  2, 'duas reservas → booked_count 2');

-- ── 1ª chamada: cancela A e libera 1 vaga ──────────────────────────────────
select is(
  public.cancel_booking_with_release((current_setting('test.a')::jsonb ->> 'booking_id')::uuid, 'teste'),
  'cancelled'::public.booking_status, 'primeira chamada retorna cancelled');

select is(
  (select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-11-10'),
  1, 'release de A → booked_count 1');

select is(
  (select status::text from public.booking
   where id = (current_setting('test.a')::jsonb ->> 'booking_id')::uuid),
  'cancelled', 'reserva A marcada como cancelled');

-- ── 2ª chamada (REGRESSÃO): já cancelada → noop, NÃO re-libera ──────────────
select is(
  public.cancel_booking_with_release((current_setting('test.a')::jsonb ->> 'booking_id')::uuid, 'denovo'),
  'cancelled'::public.booking_status, 'segunda chamada é noop e retorna cancelled');

select is(
  (select booked_count from public.location_parking_availability
   where location_parking_type_id = current_setting('test.lpt')::uuid and date = '2026-11-10'),
  1, 'REGRESSÃO: capacidade liberada UMA vez (a vaga de B é preservada)');

-- ── RLS: authenticated NÃO escreve em payment (só service_role) ─────────────
set local role authenticated;
update public.payment set status = 'refunded' where id = current_setting('test.pay')::uuid;
reset role;

select is(
  (select status::text from public.payment where id = current_setting('test.pay')::uuid),
  'paid', 'authenticated NÃO consegue alterar payment (RLS de escrita)');

select * from finish();
rollback;
