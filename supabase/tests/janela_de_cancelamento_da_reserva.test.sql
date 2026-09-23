-- pgTAP: a janela de cancelamento grátis é a da reserva, não a do catálogo (23/09/2026).
-- Spec: docs/specs/fares.md ("catálogo muda o futuro, nunca o passado").
-- Transação com rollback, sobre o banco vivo.

begin;
select plan(4);

do $$
declare cust uuid := gen_random_uuid(); v_lpt uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','janela-cust@ex.com',now(),now());
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
  r := public.create_booking_atomic(cust, v_lpt, '2027-04-10T12:00:00Z', '2027-04-12T12:00:00Z');
  perform set_config('test.bk', r ->> 'booking_id', false);
end $$;

select is((select fare_cancel_until from public.booking where id = current_setting('test.bk')::uuid),
  '2027-04-09T12:00:00Z'::timestamptz, 'Básica nasce com a janela de 24h do catálogo');

-- A reserva tem 48h (comprada assim); o catálogo continua em 24h. Trocar a data mantém as 48h.
update public.booking set fare_cancel_until = '2027-04-08T12:00:00Z' where id = current_setting('test.bk')::uuid;
select lives_ok(
  format('select public.change_booking_dates(%L::uuid, %L, %L)', current_setting('test.bk'), '2027-04-20T12:00:00Z', '2027-04-22T12:00:00Z'),
  'troca de data numa reserva pendente');
select is((select fare_cancel_until from public.booking where id = current_setting('test.bk')::uuid),
  '2027-04-18T12:00:00Z'::timestamptz, 'a janela da reserva (48h) acompanha a data nova, não a do catálogo (24h)');

-- Reserva sem janela (tarifa sem cancelamento grátis) segue sem janela depois da troca.
update public.booking set fare_cancel_until = null where id = current_setting('test.bk')::uuid;
select is((select (public.change_booking_dates(current_setting('test.bk')::uuid, '2027-04-25T12:00:00Z', '2027-04-27T12:00:00Z') is not null)
             and (select fare_cancel_until from public.booking where id = current_setting('test.bk')::uuid) is null),
  true, 'reserva sem cancelamento grátis continua sem janela depois da troca');

select * from finish();
rollback;
