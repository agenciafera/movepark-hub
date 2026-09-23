-- pgTAP: mudança de data chega ao white-label (23/09/2026). Spec: shared-availability.md, tarifas-operacao.md 2.8.
-- Transação com rollback, sobre o banco vivo (sync ligado só dentro dela).

begin;
select plan(9);

do $$
declare cust uuid := gen_random_uuid(); v_lpt uuid; v_cid uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlchg-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer') on conflict (id) do nothing;
  select lpt.id, c.id into v_lpt, v_cid
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where l.checkout_mode = 'hub' and lpt.is_active and lpt.capacity > 0 and l.status = 'active'
     and c.status = 'active' and c.onboarding_status = 'active' and pr.strategy = 'uniform_by_duration'
   order by c.name, lpt.capacity desc limit 1;
  update public.location set is_listed = true where id = (select location_id from public.location_parking_type where id = v_lpt);
  update public.company set wl_domain = coalesce(wl_domain, 'wlchg-app.movepark.co'), wl_tenant_key = coalesce(wl_tenant_key, 'wlchg'), wl_sync_enabled = true where id = v_cid;
  update public.location_parking_type set wl_category_slug = 'wlchg-cat', wl_product_slug = 'wlchg-prod', capacity = 50 where id = v_lpt;

  r := public.create_booking_atomic(cust, v_lpt, '2027-05-01T12:00:00Z', '2027-05-03T12:00:00Z');
  perform set_config('test.bk', r ->> 'booking_id', false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk') || ':reserve'), 1, 'reserva nova: reserve com o id da reserva');

-- troca de data numa reserva pendente
select lives_ok(format('select public.change_booking_dates(%L::uuid, %L, %L)', current_setting('test.bk'), '2027-05-10T12:00:00Z', '2027-05-12T12:00:00Z'), 'troca de data');
select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk') || ':release'), 1, 'libera a reserva antiga no WL');
select is((select payload ->> 'start_date' || '..' || (payload ->> 'end_date') from public.wl_delivery where event_id = current_setting('test.bk') || '#2:reserve'),
  '2027-05-10..2027-05-12', 'reserva de novo, com outro id e as datas novas');
select is((select wl_external_version from public.booking where id = current_setting('test.bk')::uuid), 2, 'a reserva guarda a versão do id externo');

-- extensão por voo (Superflex confirmada) também propaga
update public.booking set status = 'confirmed', fare_benefits = coalesce(fare_benefits, '{}'::jsonb) || '{"flight_delay_protection": true}'::jsonb,
       check_in_at = now() - interval '1 day', check_out_at = now() + interval '1 hour' where id = current_setting('test.bk')::uuid;
select lives_ok(format($f$select public.extend_booking_flight_delay(%L::uuid, now() + interval '10 hours', 'customer', null, 'LA1234')$f$, current_setting('test.bk')), 'extensão por voo');
select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk') || '#2:release'), 1, 'a extensão libera a versão 2');
select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk') || '#3:reserve'), 1, 'e reserva a versão 3 com a saída nova');

-- cancelar libera a versão vigente
update public.booking set status = 'cancelled', deleted_at = now() where id = current_setting('test.bk')::uuid;
select is((select count(*)::int from public.wl_delivery where event_id = current_setting('test.bk') || '#3:release'), 1, 'o cancelamento libera o id vigente (versão 3)');

select * from finish();
rollback;
