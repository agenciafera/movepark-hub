-- pgTAP: proteção de voo com cancelamento e excedente no balcão (25/09/2026).
-- Spec: docs/superpowers/specs/2026-09-25-protecao-de-voo-cancelamento-design.md. Transação com rollback.
begin;
select plan(15);

do $$
declare cust uuid := gen_random_uuid(); oper uuid := gen_random_uuid(); v_lpt uuid; r jsonb; v_cid uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pv-cust@ex.com',now(),now()),
    (oper,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pv-oper@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer'), (oper,'company_operator') on conflict (id) do nothing;
  select lpt.id into v_lpt
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where l.checkout_mode = 'hub' and lpt.is_active and lpt.capacity > 0 and l.status = 'active'
     and c.status = 'active' and c.onboarding_status = 'active' and pr.strategy = 'uniform_by_duration'
   order by c.name, lpt.capacity desc limit 1;
  update public.location set is_listed = true where id = (select location_id from public.location_parking_type where id = v_lpt);
  select c.id into v_cid from public.location_parking_type lpt join public.location l on l.id = lpt.location_id join public.company c on c.id = l.company_id where lpt.id = v_lpt;
  insert into public.profile_company(profile_id, company_id, role) values (oper, v_cid, 'operator');
  r := public.create_booking_atomic(cust, v_lpt, now() + interval '5 days', now() + interval '7 days', null, false, null, null, null, null, 'superflex');
  update public.booking set status = 'checked_in', check_in_at = now() - interval '47 hours', check_out_at = now() + interval '1 hour'
   where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.bk', r ->> 'booking_id', false);
  perform set_config('test.cid', v_cid::text, false);
  perform set_config('test.oper', oper::text, false);
  -- O esperado sai do motor da mesma unidade (no CI o seed decide o preço). Diária = preço(3) - preço(2).
  declare v_cs text; v_ls text; v_code text; v_take int; v_daily int;
  begin
    select c.slug, l.slug, pt.code, c.take_rate_bps into v_cs, v_ls, v_code, v_take
      from public.location_parking_type lpt
      join public.location l on l.id = lpt.location_id join public.company c on c.id = l.company_id
      join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id join public.parking_type pt on pt.id = cpt.parking_type_id
     where lpt.id = v_lpt;
    v_daily := round(((public.simulate_price(v_cs, v_ls, v_code, 3) ->> 'price')::numeric - (public.simulate_price(v_cs, v_ls, v_code, 2) ->> 'price')::numeric) * 100)::int;
    perform set_config('test.daily', coalesce(v_daily, 0)::text, false);
    perform set_config('test.credit', round(coalesce(v_daily, 0) * (10000 - coalesce(v_take, 0)) / 10000.0)::int::text, false);
  end;
end $$;

-- ── cancelamento com saída pedida além das 24h ───────────────────────────────
select throws_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '49 hours', 'customer', null, 'LA3456', 'greve')$f$, current_setting('test.bk')),
  'P0001', 'Motivo inválido: use atraso ou cancelamento.', 'motivo fora da lista é recusado');
select lives_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '49 hours', 'customer', 'voo cancelado', 'LA3456', 'cancellation')$f$, current_setting('test.bk')),
  'saída pedida a 49h não é recusada: a RPC cobre 24h e o resto vira excedente');
select is((select kind from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), 'cancellation', 'o motivo fica na extensão');
select ok((select new_check_out_at from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid) between now() + interval '24 hours 59 minutes' and now() + interval '25 hours 1 minute',
  'a saída coberta é a prevista mais 24h');
select ok((select requested_check_out_at from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid) between now() + interval '48 hours 59 minutes' and now() + interval '49 hours 1 minute',
  'a saída pedida fica gravada inteira');
select is((select check_out_at from public.booking where id = current_setting('test.bk')::uuid), (select new_check_out_at from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid),
  'a reserva estende só até a coberta');
-- O snapshot é a diária cheia do motor (calculada no fixture); o excedente pedido é 1 dia além da coberta.
select is((select overage_daily_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), current_setting('test.daily')::int, 'o preço da diária excedente fica congelado');
select is((select overage_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), current_setting('test.daily')::int, 'excedente previsto: 24h além da coberta = 1 dia');
select is((select partner_credit_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), current_setting('test.credit')::int, 'o crédito das 24h continua o de sempre (parte do parceiro)');

-- ── saída real pelo Operator ─────────────────────────────────────────────────
-- A saída real não pode ficar no futuro: move a reserva 60h para trás (coberta = agora - 35h).
update public.booking set check_out_at = check_out_at - interval '60 hours', check_in_at = check_in_at - interval '60 hours' where id = current_setting('test.bk')::uuid;
update public.booking_fare_extension set old_check_out_at = old_check_out_at - interval '60 hours', new_check_out_at = new_check_out_at - interval '60 hours',
       requested_check_out_at = requested_check_out_at - interval '60 hours' where booking_id = current_setting('test.bk')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.oper'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), 1, 'o operador da empresa enxerga a extensão');
select lives_ok(format($f$select public.operator_record_flight_checkout(%L::uuid, now() - interval '30 hours', %s, null)$f$, current_setting('test.bk'), current_setting('test.daily')),
  'o operador registra a saída real e o valor cobrado');
select is((select status::text || '|' || (checked_out_at is not null)::text from public.booking where id = current_setting('test.bk')::uuid), 'completed|true', 'a reserva é concluída com a hora real');
select is((select overage_cents || '|' || overage_charged_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), current_setting('test.daily') || '|' || current_setting('test.daily'),
  'saída real 5h depois da coberta (-35h): 1 dia de excedente, cobrado');
select throws_ok(format($f$select public.operator_record_flight_checkout(%L::uuid, now(), 0, null)$f$, current_setting('test.bk')), 'P0001', null, 'não registra duas vezes');
reset role;

-- ── sem excedente: saída real dentro da coberta ──────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.booking set status = 'checked_in', checked_out_at = null where id = current_setting('test.bk')::uuid;
update public.booking_fare_extension set actual_check_out_at = null, overage_charged_cents = null, overage_recorded_at = null where booking_id = current_setting('test.bk')::uuid;
select is((public.operator_record_flight_checkout(current_setting('test.bk')::uuid, now() - interval '40 hours', 0, null) ->> 'overage_cents')::int, 0, 'dentro da coberta o excedente é zero');

select * from finish();
rollback;
