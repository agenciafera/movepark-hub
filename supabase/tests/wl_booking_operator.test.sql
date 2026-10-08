-- pgTAP: reservas do site white-label no painel do parceiro (fase 2, 08/10/2026).
-- Migration: 20261128234500_wl_booking_operator.sql. Spec: reservas-wl-no-hub.md § 9.
--
-- O que este arquivo protege:
--   1. o escopo wl-bookings:read existe, é de empresa, não vai para chave de API, e os quatro
--      papéis o recebem (o Financeiro vê reserva sem operar);
--   2. o membro só vê as reservas do site da PRÓPRIA empresa;
--   3. quem não é membro não vê nada, e a anon key nem executa;
--   4. os filtros da tela (status, busca por número ou placa, período) e o recorte por empresa
--      do admin impersonando funcionam no servidor.

begin;
select plan(13);

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_finance uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_a uuid;
  v_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlbo-admin@ex.com',now(),now()),
    (v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlbo-owner@ex.com',now(),now()),
    (v_finance,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlbo-fin@ex.com',now(),now()),
    (v_stranger,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlbo-str@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_admin,'hub_admin'), (v_owner,'company_operator'), (v_finance,'company_operator'), (v_stranger,'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('WLBO A', 'wlbo-a', 'wlbo-a-app.movepark.co', 'wlboa') returning id into v_a;
  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('WLBO B', 'wlbo-b', 'wlbo-b-app.movepark.co', 'wlbob') returning id into v_b;

  insert into public.profile_company(profile_id, company_id, role) values
    (v_owner, v_a, 'owner'), (v_finance, v_a, 'finance');

  perform public.wl_booking_apply_page(v_a, jsonb_build_array(
    jsonb_build_object('id', 1, 'order_number', 'A-0001', 'status', jsonb_build_object('code', 'complete'),
      'license_plate', 'ABC1D23', 'initial_date', '2027-11-10 08:00:00', 'final_date', '2027-11-12 08:00:00',
      'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
      'customer', jsonb_build_object('name', 'Ana'), 'utm', jsonb_build_object(),
      'created_at', '2027-11-01 10:00:00', 'updated_at', '2027-11-01 10:00:00'),
    jsonb_build_object('id', 2, 'order_number', 'A-0002', 'status', jsonb_build_object('code', 'canceled'),
      'license_plate', 'XYZ9K88', 'initial_date', '2027-12-20 08:00:00', 'final_date', '2027-12-22 08:00:00',
      'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
      'customer', jsonb_build_object('name', 'Bia'), 'utm', jsonb_build_object(),
      'created_at', '2027-11-02 10:00:00', 'updated_at', '2027-11-02 10:00:00')
  ), '2027-11-02 10:00:00', 2);
  perform public.wl_booking_apply_page(v_b, jsonb_build_array(
    jsonb_build_object('id', 1, 'order_number', 'B-0001', 'status', jsonb_build_object('code', 'complete'),
      'initial_date', '2027-11-10 08:00:00', 'final_date', '2027-11-12 08:00:00',
      'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
      'customer', jsonb_build_object('name', 'Caio'), 'utm', jsonb_build_object(),
      'created_at', '2027-11-01 10:00:00', 'updated_at', '2027-11-01 10:00:00')
  ), '2027-11-01 10:00:00', 1);

  perform set_config('test.a', v_a::text, false);
  perform set_config('test.b', v_b::text, false);
  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.owner', v_owner::text, false);
  perform set_config('test.finance', v_finance::text, false);
  perform set_config('test.stranger', v_stranger::text, false);
end $$;

-- ── 1. o escopo ──────────────────────────────────────────────────────────────
select ok(
  exists (select 1 from public.api_scope where scope = 'wl-bookings:read'
           and not assignable_to_api_key and not is_platform_scope),
  'wl-bookings:read é escopo de empresa e não vai para chave de API');
select is(
  (select count(distinct role)::int from public.company_role_scope where scope = 'wl-bookings:read'),
  4, 'os quatro papéis veem as reservas do site');

-- ── 2. o membro vê só a própria empresa ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
select is(jsonb_array_length(public.operator_wl_bookings()), 2, 'o Dono vê as duas reservas do site dele');
select ok(
  not exists (select 1 from jsonb_array_elements(public.operator_wl_bookings()) e
               where e->>'company_id' <> current_setting('test.a')),
  'e nenhuma de outra empresa');
select is(public.operator_wl_bookings_count(), 2, 'a contagem da aba bate');

-- ── 4. filtros ───────────────────────────────────────────────────────────────
select is(jsonb_array_length(public.operator_wl_bookings(p_status => 'cancelled')), 1, 'filtra por status');
select is(public.operator_wl_bookings(p_search => 'abc-1d23') -> 0 ->> 'wl_order_number', 'A-0001',
  'busca por placa ignora hífen e caixa');
select is(public.operator_wl_bookings(p_search => '0002') -> 0 ->> 'wl_order_number', 'A-0002',
  'busca pelo número do pedido');
select is(jsonb_array_length(public.operator_wl_bookings(p_from => '2027-12-01T00:00:00Z')), 1,
  'filtra pela data de entrada');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.finance'))::text, true);
select is(jsonb_array_length(public.operator_wl_bookings()), 2, 'o Financeiro vê sem operar');

-- ── 3. quem não é membro ─────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.stranger'))::text, true);
select is(public.operator_wl_bookings(), '[]'::jsonb, 'quem não é membro não vê nada');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select is(
  public.operator_wl_bookings(p_company_id => current_setting('test.b')::uuid) -> 0 ->> 'wl_order_number',
  'B-0001', 'o admin impersonando vê só a empresa pedida');
reset role;

select ok(
  not has_function_privilege('anon', 'public.operator_wl_bookings(uuid, text, text, timestamptz, timestamptz, integer)', 'execute')
  and not has_function_privilege('anon', 'public.operator_wl_bookings_count(uuid)', 'execute'),
  'a anon key não executa');

select * from finish();
rollback;
