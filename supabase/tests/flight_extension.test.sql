-- pgTAP: proteção contra atraso de voo (Superflex) com limite, prova e lançamento (23/09/2026).
-- Spec: docs/specs/tarifas-operacao.md (2.5 a 2.7; Q-025 a Q-027). Transação com rollback.

begin;
select plan(11);

do $$
declare cust uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','voo-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  -- A única empresa hub vendável no banco vivo é a Agência Fera (rascunho): lista só nesta transação.
  select lpt.id into v_lpt
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where l.checkout_mode = 'hub' and lpt.is_active and lpt.capacity > 0 and l.status = 'active'
     and c.status = 'active' and c.onboarding_status = 'active' and pr.strategy = 'uniform_by_duration'
   order by c.name, lpt.capacity desc limit 1;
  update public.location set is_listed = true where id = (select location_id from public.location_parking_type where id = v_lpt);
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.cid', (select c.id::text from public.location_parking_type lpt join public.location l on l.id = lpt.location_id join public.company c on c.id = l.company_id where lpt.id = v_lpt), false);

  -- Superflex, 2 diárias, confirmada; a saída é daqui a 1 hora (dentro da janela de acionamento).
  r := public.create_booking_atomic(cust, v_lpt, now() + interval '5 days', now() + interval '7 days', null, false, null, null, null, null, 'superflex');
  -- o motor não aceita check-in no passado; a estadia "em curso" é ajustada por baixo, no banco
  update public.booking set status = 'confirmed', check_in_at = now() - interval '47 hours', check_out_at = now() + interval '1 hour'
   where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.bk', r ->> 'booking_id', false);
  -- Básica, para o gate de tarifa
  r := public.create_booking_atomic(cust, v_lpt, now() + interval '10 days', now() + interval '11 days', null, false, null, null, null, null, 'basica');
  update public.booking set status = 'confirmed' where id = (r ->> 'booking_id')::uuid;
  perform set_config('test.bk_basica', r ->> 'booking_id', false);
end $$;

select is((select fare_tier::text from public.booking where id = current_setting('test.bk')::uuid), 'superflex', 'fixture: Superflex confirmada');
select is((select count(*)::int from public.payout_debt_settlement where company_id = current_setting('test.cid')::uuid and kind = 'flight_extension_credit'), 0, 'fixture: sem crédito ainda');

select throws_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '5 hours', 'customer', null, null)$f$, current_setting('test.bk')),
  'P0001', 'Informe o número do voo para acionar a proteção.', 'sem número do voo não aciona');
select throws_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '30 hours', 'customer', null, 'LA3456')$f$, current_setting('test.bk_basica')),
  'P0001', 'Proteção de voo disponível só na Tarifa Superflex.', 'Básica não tem proteção (a saída pedida além de 24h deixou de ser recusa em 25/09/2026)');

-- dentro do limite: estende, grava o voo e credita o parceiro pela diária extra
select lives_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '20 hours', 'customer', 'voo atrasou', 'la3456')$f$, current_setting('test.bk')),
  'até 24h depois, com número do voo, estende');
select is((select flight_number from public.booking where id = current_setting('test.bk')::uuid), 'LA3456', 'o número do voo fica na reserva, normalizado');
select is((select added_days || '|' || flight_number from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), '1|LA3456',
  'a extensão registra 1 diária e o voo');
-- Agência Fera: 2 diárias = 54, 3 diárias = 81 na coberta (motor); parte do parceiro a 80% = 21,60
select is((select partner_credit_cents from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid), 2160,
  'o crédito ao parceiro é a parte dele na diária extra, pelo motor de preço');
select is((select amount_cents || '|' || kind from public.payout_debt_settlement where id = (select settlement_id from public.booking_fare_extension where booking_id = current_setting('test.bk')::uuid)),
  '2160|flight_extension_credit', 'o crédito vira acerto a favor do parceiro, pago pela Movepark');

select throws_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '22 hours', 'customer', null, 'LA3456')$f$, current_setting('test.bk')),
  'P0001', 'A proteção de voo já foi usada nesta reserva.', 'uma vez por reserva');

-- a janela de acionamento fecha 120 min depois da saída prevista
update public.booking set check_in_at = now() - interval '1 day', check_out_at = now() - interval '3 hours' where id = current_setting('test.bk_basica')::uuid;
update public.booking set fare_benefits = fare_benefits || '{"flight_delay_protection": true}'::jsonb where id = current_setting('test.bk_basica')::uuid;
select throws_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '5 hours', 'customer', null, 'LA1')$f$, current_setting('test.bk_basica')),
  'P0001', 'A proteção só pode ser acionada até 120 minutos depois da saída prevista.', 'depois da janela não aciona');

select * from finish();
rollback;
