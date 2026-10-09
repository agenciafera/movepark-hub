-- pgTAP: faturamento separado por origem (reservas unificadas, fase 5, 09/10/2026).
-- Migration: 20261129130000_wl_faturamento_por_origem.sql. Spec: reservas-unificadas-hub-wl.md § 6.
--
-- O que este arquivo protege:
--   1. `wl_revenue` soma o pago no site no recorte (pago não devolvido), por dia e por empresa;
--   2. a comissão do site sai só para o hub_admin e só com taxa combinada;
--   3. empresa sem white-label e outra empresa recebem zero;
--   4. o parceiro não lê `wl_take_rate_bps`, e só o hub_admin grava, só em empresa com site;
--   5. `set_company_take_rate` não devolve mais a linha inteira (o segredo do WPS);
--   6. a anon key não executa nada disso.

begin;
select plan(15);

do $$
declare
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_a uuid; v_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wfo-a@ex.com',now(),now()),
    (v_owner_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wfo-b@ex.com',now(),now()),
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wfo-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_owner_a,'company_operator'), (v_owner_b,'company_operator'), (v_admin,'hub_admin')
    on conflict (id) do update set role = excluded.role;

  insert into public.company(name, slug, wl_domain, wl_tenant_key, wl_take_rate_bps, wps_webhook_secret)
    values ('WFO Com Site', 'wfo-com-site', 'wfo-app.movepark.co', 'wfo', 1000, 'segredo-wfo') returning id into v_a;
  insert into public.company(name, slug) values ('WFO Só Hub', 'wfo-so-hub') returning id into v_b;
  insert into public.profile_company(profile_id, company_id, role) values (v_owner_a, v_a, 'owner'), (v_owner_b, v_b, 'owner');

  -- Site da A em 2027-11: dois pagos (150 e 200), um reembolsado (80, conta como pago, não soma),
  -- um pendente; e um pago fora do recorte. Uma linha intrusa na B (sem white-label).
  insert into public.wl_booking(company_id, wl_order_id, wl_order_number, status, check_in_at, paid_total_cents, wl_created_at) values
    (v_a, 1, 'WFO-1', 'confirmed', '2027-11-10 12:00+00', 15000, '2027-10-01 10:00+00'),
    (v_a, 2, 'WFO-2', 'confirmed', '2027-11-11 12:00+00', 20000, '2027-10-02 10:00+00'),
    (v_a, 3, 'WFO-3', 'refunded',  '2027-11-11 12:00+00',  8000, '2027-10-03 10:00+00'),
    (v_a, 4, 'WFO-4', 'pending',   '2027-11-12 12:00+00',  9000, '2027-10-04 10:00+00'),
    (v_a, 5, 'WFO-5', 'confirmed', '2027-12-20 12:00+00', 50000, '2027-10-05 10:00+00'),
    (v_b, 9, 'WFO-9', 'confirmed', '2027-11-10 12:00+00', 99900, '2027-10-01 10:00+00');

  perform set_config('test.a', v_a::text, false);
  perform set_config('test.owner_a', v_owner_a::text, false);
  perform set_config('test.owner_b', v_owner_b::text, false);
  perform set_config('test.admin', v_admin::text, false);
end $$;

set local role authenticated;

-- ── 1. o dono da empresa com site ────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_a'))::text, true);
create temp table _r on commit drop as
  select public.wl_revenue('2027-11-01 00:00+00', '2027-12-01 00:00+00') r;
select is((select (r->'total'->>'paid_amount')::numeric from _r), 350.00, 'soma o pago não devolvido no recorte');
select is((select (r->'total'->>'paid')::int from _r), 3, 'pagas contam o reembolsado (o dinheiro entrou)');
select is((select (r->'total'->>'created')::int from _r), 4, 'criadas no recorte, qualquer status');
select is((select jsonb_array_length(r->'by_day') from _r), 3, 'um ponto por dia de check-in');
select ok((select r->'total'->'commission' = 'null'::jsonb from _r), 'o parceiro não recebe a comissão');
select ok((select r->'by_company'->0->'wl_take_rate_bps' = 'null'::jsonb from _r), 'nem a taxa');
select is(
  (select (public.wl_revenue('2027-10-01 00:00+00', '2027-10-03 00:00+00', p_date_field => 'created_at') -> 'total' ->> 'paid_amount')::numeric),
  350.00, 'recorta pela data da compra quando pedido');
select throws_ok($q$ select wl_take_rate_bps from public.company limit 1 $q$, '42501', null, 'o parceiro não lê a coluna');

-- ── 3. sem white-label ───────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner_b'))::text, true);
select is(
  (select (public.wl_revenue('2027-11-01 00:00+00', '2027-12-01 00:00+00') -> 'total' ->> 'paid_amount')::numeric),
  0::numeric, 'empresa sem white-label recebe zero, mesmo com linha de site no banco');
select throws_ok(
  format($q$ select public.set_company_wl_take_rate(%L::uuid, 500) $q$, current_setting('test.a')),
  '42501', null, 'parceiro não grava a comissão do site');

-- ── 2. hub_admin ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select is(
  (select (public.wl_revenue('2027-11-01 00:00+00', '2027-12-01 00:00+00', p_company_ids => array[current_setting('test.a')::uuid]) -> 'total' ->> 'commission')::numeric),
  35.00, 'comissão do site para a equipe: 350 × 10%');
select is(
  (select public.set_company_wl_take_rate(current_setting('test.a')::uuid, 1200) ->> 'wl_take_rate_bps'),
  '1200', 'hub_admin grava a comissão do site');
select ok(
  not (public.set_company_take_rate(current_setting('test.a')::uuid, 1500) ? 'wps_webhook_secret'),
  'set_company_take_rate não devolve o segredo do WPS');
reset role;

-- ── 6. anon ──────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.wl_revenue(timestamptz, timestamptz, uuid[], uuid[], text)', 'execute'),
  'anon não executa wl_revenue');
select ok(not has_function_privilege('anon', 'public.set_company_wl_take_rate(uuid, integer)', 'execute'),
  'anon não executa set_company_wl_take_rate');

select * from finish();
rollback;
