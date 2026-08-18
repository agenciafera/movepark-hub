-- pgTAP: E0.13 · gatilho manual do espelho de preço WL (emergência, hub_admin).
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- O que este arquivo protege:
--   1. só hub_admin dispara (server-authoritative, ADR-005);
--   2. só vaga externa (checkout_mode='external') usa o espelho;
--   3. só vaga com mapeamento white-label completo (category + product slug) dispara;
--   4. vaga inexistente é recusada, não silenciosamente ignorada;
--   5. nem anon nem "authenticated sem ser hub_admin" executam por fora do gate.

begin;
select plan(8);

select has_function('public', 'wl_mirror_trigger', 'RPC wl_mirror_trigger existe');

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_company uuid;
  v_loc_ext uuid;
  v_loc_hub uuid;
  v_pt uuid;
  v_pt2 uuid;
  v_cpt uuid;
  v_cpt2 uuid;
  v_lpt_mapped uuid;
  v_lpt_unmapped uuid;
  v_lpt_hub uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlmt-admin@ex.com',now(),now()),
    (v_customer,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','wlmt-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_admin,'hub_admin'), (v_customer,'customer') on conflict (id) do nothing;

  insert into public.company(name, slug, wl_domain, wl_tenant_key, wl_public_domain)
    values ('WLMT Parceiro','wlmt-parceiro','wlmt-app.movepark.co','wlmt','https://wlmt.movepark.co/')
    returning id into v_company;

  insert into public.location(company_id, name, slug) values (v_company, 'WLMT Externa', 'wlmt-externa')
    returning id into v_loc_ext;
  insert into public.location(company_id, name, slug) values (v_company, 'WLMT Hub', 'wlmt-hub')
    returning id into v_loc_hub;

  insert into public.parking_type(code, name) values ('wlmt_coberta','WLMT Coberta') returning id into v_pt;
  insert into public.parking_type(code, name) values ('wlmt_descoberta','WLMT Descoberta') returning id into v_pt2;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt, 40, 10) returning id into v_cpt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt2, 40, 10) returning id into v_cpt2;

  -- mapeada: sozinha satisfaz o pré-voo, então dá pra ligar checkout_mode=external.
  insert into public.location_parking_type
      (location_id, company_parking_type_id, capacity, is_active, wl_category_slug, wl_product_slug)
    values (v_loc_ext, v_cpt, 10, true, 'wlmt', 'vaga-coberta')
    returning id into v_lpt_mapped;

  update public.location set checkout_mode = 'external' where id = v_loc_ext;

  -- sem mapeamento, inserida DEPOIS da virada: o pré-voo olha a location no UPDATE/INSERT dela
  -- mesma (20261016094000_external_readiness_on_insert.sql), não reavalia a cada vaga nova.
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc_ext, v_cpt2, 10, true) returning id into v_lpt_unmapped;

  -- vaga nativa (checkout_mode = hub, o default): o espelho não se aplica.
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc_hub, v_cpt, 10, true) returning id into v_lpt_hub;

  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.customer', v_customer::text, false);
  perform set_config('test.lpt_mapped', v_lpt_mapped::text, false);
  perform set_config('test.lpt_unmapped', v_lpt_unmapped::text, false);
  perform set_config('test.lpt_hub', v_lpt_hub::text, false);
end $$;

-- ── permissão: só hub_admin ──────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.customer'))::text, true);
select throws_ok(
  format($$ select public.wl_mirror_trigger(%L::uuid) $$, current_setting('test.lpt_mapped')),
  '42501', null, 'customer não dispara o espelho');
reset role;

-- ── vaga nativa (checkout_mode=hub): recusa ──────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select throws_ok(
  format($$ select public.wl_mirror_trigger(%L::uuid) $$, current_setting('test.lpt_hub')),
  'P0001', null, 'vaga nativa (checkout_mode=hub) não usa o espelho');
reset role;

-- ── vaga externa sem mapeamento WL: recusa ───────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select throws_ok(
  format($$ select public.wl_mirror_trigger(%L::uuid) $$, current_setting('test.lpt_unmapped')),
  'P0001', null, 'vaga externa sem category/product slug não dispara');
reset role;

-- ── vaga inexistente: recusa, não ignora em silêncio ─────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select throws_ok(
  $$ select public.wl_mirror_trigger(gen_random_uuid()) $$,
  'P0001', null, 'vaga inexistente não dispara');
reset role;

-- ── hub_admin em vaga externa mapeada: aceita e enfileira ────────────────────
-- net.http_post é assíncrono (só enfileira e devolve request_id); a transação de teste faz
-- rollback antes de qualquer worker do pg_net processar a fila, então nenhuma chamada real
-- escapa para o parceiro.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select is(
  (select (public.wl_mirror_trigger(current_setting('test.lpt_mapped')::uuid) ->> 'queued')::boolean),
  true, 'hub_admin dispara o espelho numa vaga externa mapeada');
reset role;

-- ── grants: authenticated pode (o gate real é o is_hub_admin no corpo), anon não ────
select ok(
  has_function_privilege('authenticated', 'public.wl_mirror_trigger(uuid)', 'execute'),
  'authenticated executa wl_mirror_trigger (o gate é is_hub_admin() no corpo, não o GRANT)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wl_mirror_trigger'
      and has_function_privilege('anon', p.oid, 'execute')),
  0, 'anon não executa wl_mirror_trigger');

select * from finish();
rollback;
