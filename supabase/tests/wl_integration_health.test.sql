-- pgTAP: integração com o white-label, fuso, ordem da fila e saúde (08/10/2026).
-- Migration: 20261128230000_wl_saude_fila_e_fuso.sql. Spec: shared-availability.md.
-- Transação com rollback, sobre o banco vivo (sync ligado só dentro dela).
--
-- O que este arquivo protege:
--   1. a data que vai ao WL é a de São Paulo, não a de UTC (22h de 30/04 é 30/04);
--   2. o release só sai depois do reserve do mesmo id, e a reivindicação não entrega a mesma
--      linha duas vezes;
--   3. `failed` pode ser reenviado, só por hub_admin;
--   4. erro do espelho é estado visível, carimba a verificação e não pede rebuild do site;
--   5. a reconciliação deixa carimbo de leitura boa e de erro;
--   6. a saúde acusa entrega falha, e só hub_admin a lê.

begin;
select plan(22);

do $$
declare admin uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); v_lpt uuid; v_cid uuid; r jsonb;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlhealth-cust@ex.com',now(),now()),
    (admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlhealth-admin@ex.com',now(),now());
  insert into public.profiles(id, role) values (cust,'customer'), (admin,'hub_admin')
    on conflict (id) do update set role = excluded.role;

  select lpt.id, c.id into v_lpt, v_cid
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
   where l.checkout_mode = 'hub' and lpt.is_active and lpt.capacity > 0 and l.status = 'active'
     and c.status = 'active' and c.onboarding_status = 'active' and pr.strategy = 'uniform_by_duration'
   order by c.name, lpt.capacity desc limit 1;
  update public.location set is_listed = true where id = (select location_id from public.location_parking_type where id = v_lpt);
  update public.company set wl_domain = coalesce(wl_domain, 'wlhealth-app.movepark.co'),
         wl_tenant_key = coalesce(wl_tenant_key, 'wlhealth'), wl_sync_enabled = true where id = v_cid;
  update public.location_parking_type set wl_category_slug = 'wlhealth-cat', wl_product_slug = 'wlhealth-prod', capacity = 50
   where id = v_lpt;

  -- 01:00 UTC de 01/05 é 22:00 de 30/04 em São Paulo.
  r := public.create_booking_atomic(cust, v_lpt, '2027-05-01T01:00:00Z', '2027-05-05T01:00:00Z');
  perform set_config('test.bk', r ->> 'booking_id', false);
  perform set_config('test.cust', cust::text, false);
  perform set_config('test.admin', admin::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

-- ── 1. fuso ──────────────────────────────────────────────────────────────────
select is(
  (select payload->>'start_date' from public.wl_delivery where event_id = current_setting('test.bk') || ':reserve'),
  '2027-04-30', 'entrada às 22h de São Paulo vai ao WL com o dia de São Paulo');
select is(
  (select payload->>'end_date' from public.wl_delivery where event_id = current_setting('test.bk') || ':reserve'),
  '2027-05-04', 'a saída também vai no dia de São Paulo');

-- ── 2. ordem e concessão ─────────────────────────────────────────────────────
update public.booking set status = 'cancelled', deleted_at = now() where id = current_setting('test.bk')::uuid;
select is((select count(*)::int from public.wl_delivery
            where event_id like current_setting('test.bk') || ':%' and status = 'pending'),
  2, 'reserve e release do mesmo id estão pendentes');

create temp table _claim1 on commit drop as select * from public.wl_delivery_claim(200);
select ok(exists (select 1 from _claim1 where event_id = current_setting('test.bk') || ':reserve'),
  'a reivindicação pega o reserve');
select ok(not exists (select 1 from _claim1 where event_id = current_setting('test.bk') || ':release'),
  'o release espera enquanto o reserve do mesmo id está pendente');
select ok((select wl_domain is not null from _claim1 where event_id = current_setting('test.bk') || ':reserve'),
  'a linha reivindicada traz a configuração da empresa');

create temp table _claim2 on commit drop as select * from public.wl_delivery_claim(200);
select ok(not exists (select 1 from _claim2 where event_id = current_setting('test.bk') || ':reserve'),
  'a concessão impede outra execução de pegar o mesmo reserve');

update public.wl_delivery set status = 'delivered', delivered_at = now()
 where event_id = current_setting('test.bk') || ':reserve';
create temp table _claim3 on commit drop as select * from public.wl_delivery_claim(200);
select ok(exists (select 1 from _claim3 where event_id = current_setting('test.bk') || ':release'),
  'com o reserve entregue, o release sai');

-- ── 3. reenvio ───────────────────────────────────────────────────────────────
update public.wl_delivery set status = 'failed', attempts = 6, last_error = 'WL sync 500'
 where event_id = current_setting('test.bk') || ':release';

select ok((public.wl_integration_health() -> 'motivos') ? 'entrega_falhou', 'a saúde acusa a entrega falha');
-- O id vai por fora: o cliente não enxerga a linha pela RLS, e um subselect vazio nem chamaria a função.
select set_config('test.release_id',
  (select id::text from public.wl_delivery where event_id = current_setting('test.bk') || ':release'), false);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'))::text, true);
select throws_ok(
  format($$ select public.wl_delivery_retry(%L::uuid) $$, current_setting('test.release_id')),
  '42501', null, 'cliente não reenvia entrega');
select throws_ok($$ select public.manager_wl_health() $$, '42501', null, 'cliente não lê a tela de saúde');
select throws_ok($$ select public.wl_integration_health() $$, '42501', null, 'cliente não lê a saúde');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select is(
  (select public.wl_delivery_retry((select id from public.wl_delivery where event_id = current_setting('test.bk') || ':release'))),
  true, 'hub_admin reenvia a entrega falha');
select ok(jsonb_typeof(public.manager_wl_health() -> 'units') = 'array', 'hub_admin lê a tela de saúde');
reset role;

select is((select status || '/' || attempts from public.wl_delivery where event_id = current_setting('test.bk') || ':release'),
  'pending/0', 'o reenvio volta a linha para a fila do zero');

-- ── 4. erro do espelho ───────────────────────────────────────────────────────
create temp table _rebuild_antes on commit drop as select count(*)::int n from public.site_rebuild_request;
select public.wl_mirror_flag_error(current_setting('test.lpt')::uuid, 'WL calculation-price 400: produto não encontrado');
select is(
  (select mirror_status || '|' || mirror_error from public.pricing_rule where location_parking_type_id = current_setting('test.lpt')::uuid),
  'error|WL calculation-price 400: produto não encontrado', 'o erro do espelho vira estado com a mensagem');
select ok(
  (select mirror_verified_at = now() from public.pricing_rule where location_parking_type_id = current_setting('test.lpt')::uuid),
  'o erro carimba a verificação, para a vaga sair do topo da fila');
select is((select count(*)::int from public.site_rebuild_request), (select n from _rebuild_antes),
  'registrar o erro não pede rebuild do site');
update public.pricing_rule set mirror_status = 'ok' where location_parking_type_id = current_setting('test.lpt')::uuid;
select is(
  (select mirror_error from public.pricing_rule where location_parking_type_id = current_setting('test.lpt')::uuid),
  null, 'a mensagem some quando o status sai de error');

-- ── 5. frescor da reconciliação ──────────────────────────────────────────────
select public.wl_reconcile_fail(current_setting('test.lpt')::uuid, 'WL availability 404');
select is((select reconcile_error from public.wl_sync_state where location_parking_type_id = current_setting('test.lpt')::uuid),
  'WL availability 404', 'a falha da reconciliação fica registrada na vaga');
select public.wl_reconcile_apply(current_setting('test.lpt')::uuid, '[]'::jsonb);
select ok(
  (select reconciled_at = now() and reconcile_error is null from public.wl_sync_state
    where location_parking_type_id = current_setting('test.lpt')::uuid),
  'a leitura boa carimba a vaga e limpa o erro');

-- ── 6. grants ────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.wl_delivery_claim(integer, interval)', 'execute')
      and not has_function_privilege('authenticated', 'public.wl_delivery_claim(integer, interval)', 'execute')
      and not has_function_privilege('anon', 'public.wl_integration_health(timestamptz)', 'execute')
      and not has_function_privilege('anon', 'public.manager_wl_health()', 'execute')
      and not has_function_privilege('authenticated', 'public.wl_mirror_flag_error(uuid, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.wl_reconcile_fail(uuid, text)', 'execute'),
  'as funções de servidor não são executáveis pela anon key nem por usuário logado');

select * from finish();
rollback;
