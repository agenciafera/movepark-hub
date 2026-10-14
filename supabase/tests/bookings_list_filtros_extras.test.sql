-- pgTAP: filtros de adicional, afiliado, fonte da campanha e troca de placa na lista única (14/10/2026).
-- Migration: 20261129210000_lista_reservas_filtros_extras.sql. Spec: reservas-unificadas-hub-wl.md § 4.1.
-- Transação com rollback, sobre o banco vivo.

begin;
select plan(17);

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_co uuid; v_loc uuid; v_addon uuid; v_hub1 uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fx-own@ex.com',now(),now()),
    (v_cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fx-cus@ex.com',now(),now());
  insert into public.profiles(id, role) values (v_owner,'company_operator'), (v_cust,'customer')
    on conflict (id) do update set role = excluded.role;
  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('FX Com Site', 'fx-com-site', 'fx-app.movepark.co', 'fx') returning id into v_co;
  insert into public.profile_company(profile_id, company_id, role) values (v_owner, v_co, 'owner');
  insert into public.location(company_id, name, slug) values (v_co, 'FX A', 'fx-a') returning id into v_loc;
  insert into public.add_on_service(company_id, code, name, base_price) values (v_co, 'fx-capa', 'Capa FX', 10) returning id into v_addon;

  -- Hub: FXH1 com adicional, campanha Google e troca de placa; FXH2 sem nada.
  insert into public.booking(code, location_id, profile_id, status, check_in_at, check_out_at, created_at, total_amount, customer_name, utm_source)
    values ('FXH1', v_loc, v_cust, 'confirmed', '2027-11-10 10:00+00', '2027-11-12 10:00+00', '2027-10-01 10:00+00', 100, 'Hub Um', 'Google')
    returning id into v_hub1;
  insert into public.booking(code, location_id, profile_id, status, check_in_at, check_out_at, created_at, total_amount, customer_name)
    values ('FXH2', v_loc, v_cust, 'confirmed', '2027-11-10 10:00+00', '2027-11-12 10:00+00', '2027-10-01 09:00+00', 100, 'Hub Dois');
  insert into public.booking_item(booking_id, item_type, add_on_service_id, unit_price, subtotal) values (v_hub1, 'add_on', v_addon, 10, 10);
  insert into public.booking_modification(booking_id, type, changes)
    values (v_hub1, 'vehicle_change', jsonb_build_object('from', jsonb_build_object('license_plate', 'AAA1A11')));

  -- Site: FXW1 com adicional, afiliado, campanha google e troca de placa; FXW2 só a vaga.
  insert into public.wl_booking(company_id, wl_order_id, wl_order_number, status, check_in_at, check_out_at, wl_created_at, items, is_affiliated, utm) values
    (v_co, 901, 'FXW1', 'confirmed', '2027-11-10 10:00+00', '2027-11-12 10:00+00', '2027-10-01 11:00+00',
     '[{"is_spot": true, "product_name": "Vaga coberta", "quantity": 1, "unit_price": 90},
       {"is_spot": false, "product_name": "Seguro FX", "quantity": 1, "unit_price": 20}]'::jsonb,
     true, '{"utm_source": "google"}'::jsonb),
    (v_co, 902, 'FXW2', 'confirmed', '2027-11-10 10:00+00', '2027-11-12 10:00+00', '2027-10-01 08:00+00',
     '[{"is_spot": true, "product_name": "Vaga coberta", "quantity": 1, "unit_price": 90}]'::jsonb,
     false, '{"utm_source": "header-site"}'::jsonb);
  insert into public.wl_booking_event(wl_booking_id, company_id, kind, wl_event_id, occurred_at, actor, data)
    select w.id, v_co, 'plate_change', 1, now(), 'Maria', jsonb_build_object('old_plate', 'OLD1A23', 'new_plate', 'XYZ9K88')
      from public.wl_booking w where w.company_id = v_co and w.wl_order_number = 'FXW1';

  perform set_config('test.co', v_co::text, false);
  perform set_config('test.owner', v_owner::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'), 'role', 'authenticated')::text, true);

create or replace function pg_temp.codigos(p jsonb) returns text language sql as $$
  select coalesce(string_agg(c, ',' order by c), '')
    from (select coalesce(i->'wl'->>'wl_order_number', (select b.code from public.booking b where b.id = (i->>'id')::uuid)) c
            from jsonb_array_elements(p->'items') i) x
$$;
create or replace function pg_temp.lista(p_add_on text default null, p_aff boolean default null, p_utm text default null, p_plate boolean default null)
returns text language sql as $$
  select pg_temp.codigos(public.bookings_list_page(
    p_company_ids := array[current_setting('test.co')::uuid], p_with_summary := false,
    p_add_on := p_add_on, p_affiliated := p_aff, p_utm_source := p_utm, p_plate_changed := p_plate))
$$;

select is(pg_temp.lista(), 'FXH1,FXH2,FXW1,FXW2', 'sem filtro: as quatro');
select is(pg_temp.lista(p_add_on := 'any'), 'FXH1,FXW1', 'com qualquer adicional, nas duas origens');
select is(pg_temp.lista(p_add_on := 'none'), 'FXH2,FXW2', 'sem adicional');
select is(pg_temp.lista(p_add_on := 'Capa FX'), 'FXH1', 'adicional do Hub pelo nome');
select is(pg_temp.lista(p_add_on := 'Seguro FX'), 'FXW1', 'adicional do site pelo nome');
select is(pg_temp.lista(p_add_on := 'Vaga coberta'), '', 'a vaga não conta como adicional');
select is(pg_temp.lista(p_aff := true), 'FXW1', 'afiliado: só o site tem');
select is(pg_temp.lista(p_aff := false), 'FXH1,FXH2,FXW2', 'não afiliado: o Hub inteiro e o site sem afiliado');
select is(pg_temp.lista(p_utm := 'GOOGLE'), 'FXH1,FXW1', 'fonte da campanha sem diferença de caixa, nas duas origens');
select is(pg_temp.lista(p_utm := 'header-site'), 'FXW2', 'fonte só do site');
select is(pg_temp.lista(p_plate := true), 'FXH1,FXW1', 'com troca de placa, nas duas origens');
select is(pg_temp.lista(p_plate := false), 'FXH2,FXW2', 'sem troca de placa');
select is(pg_temp.lista(p_add_on := 'any', p_utm := 'google', p_plate := true), 'FXH1,FXW1', 'filtros combinam');

select ok((public.bookings_filter_options(array[current_setting('test.co')::uuid]) -> 'add_ons') @> '["Capa FX", "Seguro FX"]'::jsonb,
  'opções de adicional trazem os do Hub e os do site');
select ok(not ((public.bookings_filter_options(array[current_setting('test.co')::uuid]) -> 'add_ons') @> '["Vaga coberta"]'::jsonb),
  'e não trazem a vaga');
select ok((public.bookings_filter_options(array[current_setting('test.co')::uuid]) -> 'utm_sources') @> '["google", "header-site"]'::jsonb,
  'fontes de campanha das duas origens, em minúsculas e sem repetir');

reset role;
set local role anon;
select throws_ok($$select public.bookings_filter_options(null)$$, '42501', null, 'a anon key não lê as opções');
reset role;

select * from finish();
rollback;
