-- pgTAP: reservas do site white-label importadas para wl_booking (08/10/2026).
-- Migration: 20261128233000_wl_booking_importacao.sql. Spec: reservas-wl-no-hub.md.
--
-- O que este arquivo protege:
--   1. a hora local do legado vira o instante certo (22h de São Paulo é 01h UTC do dia seguinte);
--   2. o status do legado vira o vocabulário do Hub, e o De/Para acha a vaga;
--   3. reserva do Hub não é importada de volta, e o que saiu antes da janela é pulado;
--   4. o cursor anda junto com a gravação, e linha velha não sobrescreve linha nova;
--   5. só hub_admin lê, e as funções de servidor ficam fora do alcance da anon key;
--   6. ligada e sem leitura boa, a importação acusa na saúde.

begin;
select plan(18);

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_company uuid;
  v_loc uuid;
  v_pt uuid;
  v_cpt uuid;
  v_lpt uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlbi-admin@ex.com',now(),now()),
    (v_customer,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlbi-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (v_admin,'hub_admin'), (v_customer,'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('WLBI Parceiro', 'wlbi-parceiro', 'wlbi-app.movepark.co', 'wlbi')
    returning id into v_company;
  insert into public.location(company_id, name, slug) values (v_company, 'WLBI Unidade', 'wlbi-unidade')
    returning id into v_loc;
  insert into public.parking_type(code, name) values ('wlbi_coberta', 'WLBI Coberta') returning id into v_pt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt, 40, 10) returning id into v_cpt;
  insert into public.location_parking_type
      (location_id, company_parking_type_id, capacity, is_active, wl_category_slug, wl_product_slug)
    values (v_loc, v_cpt, 10, true, 'wlbi-unidade', 'vaga-coberta')
    returning id into v_lpt;

  perform set_config('test.company', v_company::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.customer', v_customer::text, false);
  perform set_config('test.hub_booking', coalesce((select id::text from public.booking limit 1), ''), false);
end $$;

-- ── 1 e 2. gravação, hora local, status e De/Para ────────────────────────────
select is(
  public.wl_booking_apply_page(
    current_setting('test.company')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'id', 101, 'order_number', '271001-0001', 'status', jsonb_build_object('code', 'complete'),
        'origin', 'reserva-online', 'external_id', null,
        'category', jsonb_build_object('slug', 'wlbi-unidade'), 'product_slug', 'vaga-coberta',
        'initial_date', '2027-10-01 22:00:00', 'final_date', '2027-10-05 06:30:00',
        'license_plate', 'ABC1D23', 'passenger_count', 2, 'has_pcd', false,
        'total_price', 150.5, 'paid_total_price', 150.5,
        'attendance_status', 'pendente', 'is_duplicate', false,
        'customer', jsonb_build_object('name', 'Fulano', 'last_name', 'de Tal', 'email', ' Fulano@Ex.com ', 'phone', '11999990000'),
        'utm', jsonb_build_object('utm_source', 'google'),
        'created_at', '2027-09-20 10:00:00', 'updated_at', '2027-09-20 10:05:00'
      ),
      jsonb_build_object(
        'id', 102, 'order_number', '271001-0002', 'status', jsonb_build_object('code', 'canceled'),
        'category', jsonb_build_object('slug', 'outra-unidade'), 'product_slug', 'vaga-coberta',
        'initial_date', '2027-10-02 10:00:00', 'final_date', '2027-10-03 10:00:00',
        'customer', jsonb_build_object(), 'utm', jsonb_build_object(),
        'created_at', '2027-09-21 10:00:00', 'updated_at', '2027-09-21 10:00:00'
      )
    ),
    '2027-09-21 10:00:00', 102
  ),
  '{"written": 2, "skipped": 0}'::jsonb,
  'grava as duas reservas da página');

select is(
  (select check_in_at from public.wl_booking where company_id = current_setting('test.company')::uuid and wl_order_id = 101),
  '2027-10-02 01:00:00+00'::timestamptz,
  'entrada às 22h de São Paulo é 01h UTC do dia seguinte');
select is(
  (select status || '|' || wl_status from public.wl_booking where company_id = current_setting('test.company')::uuid and wl_order_id = 101),
  'confirmed|complete', 'complete do legado vira confirmed, e o original fica guardado');
select is(
  (select location_parking_type_id from public.wl_booking where company_id = current_setting('test.company')::uuid and wl_order_id = 101),
  current_setting('test.lpt')::uuid, 'o De/Para de slugs acha a vaga do Hub');
select is(
  (select location_parking_type_id from public.wl_booking where company_id = current_setting('test.company')::uuid and wl_order_id = 102),
  null, 'unidade sem De/Para fica sem vaga, mas a reserva entra');
select is(
  (select total_cents || '|' || customer_name || '|' || customer_email from public.wl_booking
    where company_id = current_setting('test.company')::uuid and wl_order_id = 101),
  '15050|Fulano de Tal|fulano@ex.com', 'valor em centavos, nome completo e e-mail normalizado');
select is(
  (select cursor_updated_since || '|' || cursor_after_id from public.wl_booking_sync_state
    where company_id = current_setting('test.company')::uuid),
  '2027-09-21 10:00:00|102', 'o cursor anda junto com a gravação');

-- ── 4. linha velha não sobrescreve ───────────────────────────────────────────
select public.wl_booking_apply_page(
  current_setting('test.company')::uuid,
  jsonb_build_array(jsonb_build_object(
    'id', 101, 'order_number', '271001-0001', 'status', jsonb_build_object('code', 'new'),
    'category', jsonb_build_object('slug', 'wlbi-unidade'), 'product_slug', 'vaga-coberta',
    'initial_date', '2027-10-01 22:00:00', 'final_date', '2027-10-05 06:30:00',
    'customer', jsonb_build_object(), 'utm', jsonb_build_object(),
    'created_at', '2027-09-20 10:00:00', 'updated_at', '2027-09-20 09:00:00')),
  '2027-09-21 10:00:00', 102);
select is(
  (select status from public.wl_booking where company_id = current_setting('test.company')::uuid and wl_order_id = 101),
  'confirmed', 'versão mais antiga do pedido não desfaz a mais nova');

select public.wl_booking_apply_page(
  current_setting('test.company')::uuid,
  jsonb_build_array(jsonb_build_object(
    'id', 101, 'order_number', '271001-0001', 'status', jsonb_build_object('code', 'canceled'),
    'category', jsonb_build_object('slug', 'wlbi-unidade'), 'product_slug', 'vaga-coberta',
    'initial_date', '2027-10-01 22:00:00', 'final_date', '2027-10-05 06:30:00',
    'customer', jsonb_build_object(), 'utm', jsonb_build_object(),
    'created_at', '2027-09-20 10:00:00', 'updated_at', '2027-09-22 08:00:00')),
  '2027-09-22 08:00:00', 101);
select is(
  (select status from public.wl_booking where company_id = current_setting('test.company')::uuid and wl_order_id = 101),
  'cancelled', 'o cancelamento no site chega como atualização');

-- ── 3. o que é pulado ────────────────────────────────────────────────────────
select is(
  public.wl_booking_apply_page(
    current_setting('test.company')::uuid,
    jsonb_build_array(jsonb_build_object(
      'id', 103, 'order_number', '200101-0001', 'status', jsonb_build_object('code', 'complete'),
      'category', jsonb_build_object('slug', 'wlbi-unidade'), 'product_slug', 'vaga-coberta',
      'initial_date', '2020-01-01 10:00:00', 'final_date', '2020-01-03 10:00:00',
      'customer', jsonb_build_object(), 'utm', jsonb_build_object(),
      'created_at', '2020-01-01 09:00:00', 'updated_at', '2020-01-01 09:00:00')),
    '2027-09-23 00:00:00', 103) ->> 'skipped',
  '1', 'reserva que saiu antes da janela de 12 meses é pulada');
select is(
  (select count(*)::int from public.wl_booking where company_id = current_setting('test.company')::uuid and wl_order_id = 103),
  0, 'e não fica gravada');

select case when current_setting('test.hub_booking') = '' then
  skip('sem reserva do Hub no banco para testar o pulo do external_id', 1)
else
  is(
    public.wl_booking_apply_page(
      current_setting('test.company')::uuid,
      jsonb_build_array(jsonb_build_object(
        'id', 104, 'order_number', '271001-0004', 'status', jsonb_build_object('code', 'complete'),
        'external_id', current_setting('test.hub_booking') || '#2',
        'category', jsonb_build_object('slug', 'wlbi-unidade'), 'product_slug', 'vaga-coberta',
        'initial_date', '2027-10-01 10:00:00', 'final_date', '2027-10-02 10:00:00',
        'customer', jsonb_build_object(), 'utm', jsonb_build_object(),
        'created_at', '2027-09-23 09:00:00', 'updated_at', '2027-09-23 09:00:00')),
      '2027-09-23 09:00:00', 104) ->> 'skipped',
    '1', 'pedido que é uma reserva do Hub não é importado de volta')
end;

-- ── 6. saúde ─────────────────────────────────────────────────────────────────
update public.app_setting set value = '{"enabled": true, "lookback_months": 12, "page_limit": 200}'
 where key = 'wl_booking_import';
select ok(
  (public.wl_integration_health() -> 'motivos') ? 'importacao_parada',
  'ligada, empresa sem leitura boa acusa importacao_parada');
select public.wl_booking_sync_fail(current_setting('test.company')::uuid, 'WL orders 404');
select is(
  (select last_error from public.wl_booking_sync_state where company_id = current_setting('test.company')::uuid),
  'WL orders 404', 'a falha fica registrada na empresa');
update public.app_setting set value = '{"enabled": false, "lookback_months": 12, "page_limit": 200}'
 where key = 'wl_booking_import';
select ok(
  not ((public.wl_integration_health() -> 'motivos') ? 'importacao_parada'),
  'desligada, a importação não entra no alarme');

-- ── 5. quem lê ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.customer'))::text, true);
select is((select count(*)::int from public.wl_booking), 0, 'cliente não lê reserva do site do parceiro');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select ok((select count(*)::int from public.wl_booking where company_id = current_setting('test.company')::uuid) = 2,
  'hub_admin lê');
reset role;

select ok(not has_function_privilege('anon', 'public.wl_booking_apply_page(uuid, jsonb, text, bigint)', 'execute')
      and not has_function_privilege('authenticated', 'public.wl_booking_apply_page(uuid, jsonb, text, bigint)', 'execute')
      and not has_function_privilege('authenticated', 'public.wl_booking_sync_fail(uuid, text)', 'execute')
      and not has_function_privilege('anon', 'public.wl_booking_import_policy()', 'execute')
      and not has_table_privilege('anon', 'public.wl_booking', 'select'),
  'gravação só pelo servidor, e a anon key não lê a tabela');

select * from finish();
rollback;
