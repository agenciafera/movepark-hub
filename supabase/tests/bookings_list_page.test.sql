-- pgTAP: lista única de reservas, Hub e white-label (fases 1 e 2, 09/10/2026).
-- Migration: 20261129100000_reservas_unificadas_lista.sql. Spec: reservas-unificadas-hub-wl.md.
--
-- O que este arquivo protege:
--   1. "tem white-label" é uma regra só (wl_domain), e quem não tem não vê reserva do site nem pela
--      lista nem lendo a tabela, mesmo que alguma exista no banco;
--   2. quem tem vê Hub e site juntos, ordenados pela compra, com a origem de cada um;
--   3. o status do site sai no vocabulário do Hub (D2) e o filtro de status vale para os dois;
--   4. a visão do estacionamento mostra só o que virou venda, nas duas origens;
--   5. filtros só do Hub (forma de pagamento) tiram o site; a busca acha placa com hífen;
--   6. paginação e o resumo por origem cobrem o recorte inteiro;
--   7. a anon key não executa.

begin;
select plan(17);

do $$
declare
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_a uuid; v_b uuid; v_loc_a uuid; v_loc_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','blp-a@ex.com',now(),now()),
    (v_owner_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','blp-b@ex.com',now(),now()),
    (v_cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','blp-c@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_owner_a,'company_operator'), (v_owner_b,'company_operator'), (v_cust,'customer')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug, wl_domain, wl_tenant_key)
    values ('BLP Com Site', 'blp-com-site', 'blp-app.movepark.co', 'blp') returning id into v_a;
  insert into public.company(name, slug) values ('BLP Só Hub', 'blp-so-hub') returning id into v_b;
  insert into public.profile_company(profile_id, company_id, role) values (v_owner_a, v_a, 'owner'), (v_owner_b, v_b, 'owner');
  insert into public.location(company_id, name, slug) values (v_a, 'BLP A', 'blp-a') returning id into v_loc_a;
  insert into public.location(company_id, name, slug) values (v_b, 'BLP B', 'blp-b') returning id into v_loc_b;

  -- Hub: uma paga em cada empresa e uma pendente na A (não é venda).
  insert into public.booking(code, location_id, profile_id, status, check_in_at, check_out_at, created_at, total_amount, customer_name) values
    ('BLPHUBA1', v_loc_a, v_cust, 'confirmed', '2027-11-10 10:00+00', '2027-11-12 10:00+00', '2027-10-01 10:00+00', 100, 'Ana Hub'),
    ('BLPHUBA2', v_loc_a, v_cust, 'pending',   '2027-11-10 10:00+00', '2027-11-12 10:00+00', '2027-10-01 09:00+00', 100, 'Pend Hub'),
    ('BLPHUBB1', v_loc_b, v_cust, 'confirmed', '2027-11-10 10:00+00', '2027-11-12 10:00+00', '2027-10-01 10:00+00', 80, 'Bia Hub');

  -- Site da A: paga e já usada (compareceu, saída no passado), paga futura, pendente.
  perform public.wl_booking_apply_page(v_a, jsonb_build_array(
    jsonb_build_object('id', 1, 'order_number', 'BLP-0001', 'status', jsonb_build_object('code', 'complete'),
      'license_plate', 'ABC1D23', 'attendance_status', 'compareceu', 'paid_total_price', 150,
      'initial_date', '2026-09-01 08:00:00', 'final_date', '2026-09-03 08:00:00',
      'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
      'customer', jsonb_build_object('name', 'Caio Site'), 'utm', jsonb_build_object(),
      'created_at', '2027-10-01 11:00:00', 'updated_at', '2027-10-01 11:00:00'),
    jsonb_build_object('id', 2, 'order_number', 'BLP-0002', 'status', jsonb_build_object('code', 'complete'),
      'license_plate', 'XYZ9K88', 'paid_total_price', 200,
      'initial_date', '2027-11-20 08:00:00', 'final_date', '2027-11-22 08:00:00',
      'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
      'customer', jsonb_build_object('name', 'Duda Site'), 'utm', jsonb_build_object(),
      'created_at', '2027-10-01 08:00:00', 'updated_at', '2027-10-01 08:00:00'),
    jsonb_build_object('id', 3, 'order_number', 'BLP-0003', 'status', jsonb_build_object('code', 'new'),
      'paid_total_price', 90, 'initial_date', '2027-11-20 08:00:00', 'final_date', '2027-11-22 08:00:00',
      'category', jsonb_build_object('slug', 'x'), 'product_slug', 'y',
      'customer', jsonb_build_object('name', 'Edu Site'), 'utm', jsonb_build_object(),
      'created_at', '2027-10-01 06:30:00', 'updated_at', '2027-10-01 06:30:00')
  ), '2027-10-01 11:00:00', 3);

  -- Uma linha de site na empresa SEM white-label (não deveria existir; se existir, não aparece).
  insert into public.wl_booking(company_id, wl_order_id, wl_order_number, status, check_in_at, check_out_at, wl_created_at)
    values (v_b, 9, 'INTRUSA', 'confirmed', '2027-11-10 10:00+00', '2027-11-12 10:00+00', '2027-10-01 12:00+00');

  perform set_config('test.a', v_a::text, false);
  perform set_config('test.b', v_b::text, false);
  perform set_config('test.owner_a', v_owner_a::text, false);
  perform set_config('test.owner_b', v_owner_b::text, false);
end $$;

-- ── 1. a regra ───────────────────────────────────────────────────────────────
select ok(public.company_has_wl(current_setting('test.a')::uuid) and not public.company_has_wl(current_setting('test.b')::uuid),
  'tem white-label = wl_domain preenchido');

-- ── 2. quem tem vê os dois juntos ────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_a'))::text, true);
create temp table _a on commit drop as select public.bookings_list_page(p_date_field => 'created_at') r;
select is((select (r->>'total')::int from _a), 5, 'empresa com site vê 2 do Hub e 3 do site');
select is(
  (select string_agg(e->>'source', ',' order by ord) from _a, jsonb_array_elements(r->'items') with ordinality as t(e, ord)),
  'wl,wl,hub,wl,hub', 'ordenadas pela data da compra, misturando as origens');
select is(
  (select e->'wl'->>'status' from _a, jsonb_array_elements(r->'items') e where e->'wl'->>'wl_order_number' = 'BLP-0001'),
  'completed', 'pago com comparecimento e saída no passado vira Concluída (D2)');
select is(
  (select e->'wl'->>'site_status' from _a, jsonb_array_elements(r->'items') e where e->'wl'->>'wl_order_number' = 'BLP-0001'),
  'confirmed', 'e o status do site segue junto, para o detalhe e as ações');

-- ── 3. filtro de status vale para os dois ────────────────────────────────────
select is(
  (select (public.bookings_list_page(p_statuses => array['completed']) ->> 'total')::int), 1,
  'filtro Concluída acha a reserva do site');

-- ── 4. visão do estacionamento ───────────────────────────────────────────────
select is(
  (select (public.bookings_list_page(p_partner_view => true) ->> 'total')::int), 3,
  'o estacionamento vê só venda: tira a pendente do Hub e a pendente do site');

-- ── 5. filtros ───────────────────────────────────────────────────────────────
select is(
  (select (public.bookings_list_page(p_payment => 'none') -> 'summary' -> 'wl' ->> 'total')::int), 0,
  'filtro de forma de pagamento (dado só do Hub) tira o site');
select is(
  (select public.bookings_list_page(p_search => 'xyz-9k88') -> 'items' -> 0 -> 'wl' ->> 'wl_order_number'),
  'BLP-0002', 'busca acha a placa do site com hífen');
select is(
  (select (public.bookings_list_page(p_source => 'hub') ->> 'total')::int), 2,
  'filtro de origem Hub');
select is(
  (select (public.bookings_list_page(p_source => 'wl') ->> 'total')::int), 3,
  'filtro de origem White-label');

-- ── 6. paginação e resumo ────────────────────────────────────────────────────
select is(
  (select jsonb_array_length(public.bookings_list_page(p_limit => 2, p_offset => 4) -> 'items')), 1,
  'a última página traz o que sobra');
select ok(
  (select (r->'summary'->'wl'->>'paid')::int = 2 and (r->'summary'->'wl'->>'paid_amount')::numeric = 350 from _a),
  'resumo do site: 2 pagas somando 350, do recorte inteiro');

-- ── 1. quem não tem white-label não vê nada do site ──────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_b'))::text, true);
select is(
  (select (public.bookings_list_page() ->> 'total')::int), 1,
  'empresa sem site vê só a reserva do Hub, mesmo havendo linha de site no banco');
select is(
  (select (public.bookings_list_page() -> 'summary' -> 'wl' ->> 'total')::int), 0,
  'e o resumo do site sai zerado');
select is((select count(*)::int from public.wl_booking), 0,
  'e nem lendo a tabela direto');
reset role;

-- ── 7. anon ──────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon',
    'public.bookings_list_page(text, text[], uuid[], uuid[], text, timestamptz, timestamptz, text, text, text[], boolean, integer, integer)',
    'execute'),
  'a anon key não executa');

select * from finish();
rollback;
