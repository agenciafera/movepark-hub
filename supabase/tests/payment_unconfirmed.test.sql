-- pgTAP: cobrança de cartão sem resposta do gateway (26/11/2026, MP-F00991).
-- A Edge grava o pagamento pendente SEM ids e com prazo. Cobre: o cron não expira a reserva dentro
-- do prazo; vencido o prazo, dá o pagamento como recusado e expira a reserva; não toca cartão em
-- análise (com id); e a cobrança que aparece depois (failed → paid) reconfirma a reserva expirada.
-- Roda em transação com rollback.

begin;
select plan(8);

create function pg_temp.d(n int) returns timestamptz language sql as $f$
  select ((current_date + 29 + n)::timestamp + interval '12 hours') at time zone 'UTC'
$f$;

-- ── fixture: customer + unidade própria com capacidade = 1 (mesma do booking_hold) ──
do $$
declare
  u uuid := gen_random_uuid();
  cid uuid := gen_random_uuid(); loc uuid := gen_random_uuid(); pt uuid := gen_random_uuid();
  cpt uuid := gen_random_uuid(); v_lpt uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','semresposta@ex.com',now(),now());
  insert into public.profiles(id, role) values (u,'customer') on conflict (id) do nothing;
  insert into public.company(id, name, slug, status, onboarding_status, contract_accepted_at, gateway_split_enabled)
    values (cid, 'Sem Resposta', 'sem-resposta', 'active', 'active', now(), true);
  insert into public.payout_recipient(company_id, provider, external_recipient_id, status)
    values (cid, 'pagarme', 're_semresposta', 'active');
  insert into public.location(id, company_id, name, slug, status, photos, checkout_mode)
    values (loc, cid, 'Sem Resposta Unidade', 'sem-resposta-unidade', 'active',
            '["/Estacionamentos/seed/foto-de-teste.webp"]'::jsonb, 'hub');
  insert into public.parking_type(id, code, name) values (pt, 'semresp_coberta', 'Sem Resposta Coberta');
  insert into public.company_parking_type(id, company_id, parking_type_id, base_price, default_capacity)
    values (cpt, cid, pt, 10, 1);
  insert into public.location_parking_type(id, location_id, company_parking_type_id, capacity, is_active,
                                           has_minimum_stay, has_minimum_date)
    values (v_lpt, loc, cpt, 1, true, false, false);
  insert into public.pricing_rule(location_parking_type_id, strategy) values (v_lpt, 'uniform_by_duration');
  perform public.wl_mirror_apply_pricing(
    v_lpt, '{"strategy":"uniform_by_duration","old_price_strategy":"none"}'::jsonb,
    '[{"from_day":1,"to_day":null,"unit_price":10,"is_old_price":false}]'::jsonb, 10, '[]'::jsonb, 1);
  perform set_config('test.u', u::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- ── 1) dentro do prazo: reserva segura, pagamento segue pendente ──────────────
do $$
declare r jsonb; v_bk uuid; v_pay uuid;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    pg_temp.d(1), pg_temp.d(2));
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set expires_at = now() - interval '1 hour' where id = v_bk;
  insert into public.payment(booking_id, provider, method, amount, status, expires_at)
    values (v_bk, 'pagarme', 'card', 10, 'pending', now() + interval '30 minutes') returning id into v_pay;
  perform public.cron_expire_pending_bookings();
  perform set_config('test.bk_1', v_bk::text, false);
  perform set_config('test.pay_1', v_pay::text, false);
end $$;

select is((select status::text from public.booking where id = current_setting('test.bk_1')::uuid),
  'pending', '1: dentro do prazo o cron não expira a reserva');
select is((select status::text from public.payment where id = current_setting('test.pay_1')::uuid),
  'pending', '1: dentro do prazo o pagamento sem resposta segue pendente');

-- ── 2) prazo vencido: pagamento vira failed e a reserva expira ────────────────
do $$
declare r jsonb; v_bk uuid; v_pay uuid;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    pg_temp.d(5), pg_temp.d(6));
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set expires_at = now() - interval '1 hour' where id = v_bk;
  insert into public.payment(booking_id, provider, method, amount, status, expires_at)
    values (v_bk, 'pagarme', 'card', 10, 'pending', now() - interval '1 minute') returning id into v_pay;
  perform public.cron_expire_pending_bookings();
  perform set_config('test.bk_2', v_bk::text, false);
  perform set_config('test.pay_2', v_pay::text, false);
end $$;

select is((select status::text from public.payment where id = current_setting('test.pay_2')::uuid),
  'failed', '2: prazo vencido, o cron dá o pagamento sem resposta como recusado');
select is((select status::text from public.booking where id = current_setting('test.bk_2')::uuid),
  'expired', '2: e a reserva expira no mesmo passe, soltando a vaga');

-- ── 3) cartão em análise (com id do gateway) não é tocado, mesmo com expires_at no passado ──
do $$
declare r jsonb; v_bk uuid; v_pay uuid;
begin
  r := public.create_booking_atomic(current_setting('test.u')::uuid, current_setting('test.lpt')::uuid,
    pg_temp.d(8), pg_temp.d(9));
  v_bk := (r ->> 'booking_id')::uuid;
  update public.booking set expires_at = now() - interval '1 hour' where id = v_bk;
  insert into public.payment(booking_id, provider, method, amount, status, provider_payment_id, provider_charge_id, expires_at)
    values (v_bk, 'pagarme', 'card', 10, 'pending', 'or_analise', 'ch_analise', now() - interval '1 minute')
    returning id into v_pay;
  perform public.cron_expire_pending_bookings();
  perform set_config('test.bk_3', v_bk::text, false);
  perform set_config('test.pay_3', v_pay::text, false);
end $$;

select is((select status::text from public.payment where id = current_setting('test.pay_3')::uuid),
  'pending', '3: cartão com id do gateway segue pendente');
select is((select status::text from public.booking where id = current_setting('test.bk_3')::uuid),
  'pending', '3: e a reserva dele não expira');

-- ── 4) a cobrança aparece depois do prazo: failed → paid reconfirma a reserva expirada ──
-- É o caminho do webhook: pendura os ids na linha (attachUnconfirmedPayment), grava o pago e chama
-- confirm_or_refund_booking. A vaga do caso 2 ficou livre, então a reserva volta.
do $$
declare v_pay uuid := current_setting('test.pay_2')::uuid; ap record; res jsonb;
begin
  update public.payment set provider_payment_id = 'or_tardio', provider_charge_id = 'ch_tardio' where id = v_pay;
  select * into ap from public.apply_payment_webhook_status(v_pay, 'paid', true);
  res := public.confirm_or_refund_booking(current_setting('test.bk_2')::uuid, v_pay);
  perform set_config('test.ap_4', ap.applied::text, false);
  perform set_config('test.res_4', res::text, false);
end $$;

select is(current_setting('test.ap_4'), 'true', '4: failed → paid é aceito (failed não é terminal)');
select is(current_setting('test.res_4')::jsonb ->> 'outcome', 'reconfirmed',
  '4: a reserva expirada volta confirmada quando ainda há vaga');

select * from finish();
rollback;
