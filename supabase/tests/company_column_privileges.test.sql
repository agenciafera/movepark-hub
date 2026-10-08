-- pgTAP: privilégio por coluna em `company` e segurança da integração white-label (08/10/2026).
-- Migration: 20261129090000_company_colunas_e_wl_seguranca.sql.
--
-- O que este arquivo protege:
--   1. a chave pública (anon) lê só o que a vitrine usa, e não escreve nada;
--   2. nenhum usuário logado lê pelo PostgREST o segredo do WPS, o IP do aceite do contrato, o
--      tenant do WL nem a comissão; o hub_admin lê pela RPC, e o segredo nunca sai, só se existe;
--   3. coluna nova não ganha leitura sozinha (a lista é exata nos dois sentidos);
--   4. wl_domain e wl_public_domain só aceitam hostname puro;
--   5. wl_company_config exige o escopo da Ocupação.

begin;
select plan(13);

-- ── 1. anon ──────────────────────────────────────────────────────────────────
select set_eq(
  $$ select c.column_name::text from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'company'
        and has_column_privilege('anon', 'public.company', c.column_name, 'select') $$,
  array['id', 'name', 'slug', 'legal_name', 'tax_id', 'status', 'created_at', 'updated_at',
        'deleted_at', 'onboarding_status', 'logo_url'],
  'anon lê exatamente as colunas da vitrine'
);
select ok(
  not has_table_privilege('anon', 'public.company', 'insert')
  and not has_table_privilege('anon', 'public.company', 'update')
  and not has_table_privilege('anon', 'public.company', 'delete'),
  'anon não escreve em company');

-- ── 2 e 3. authenticated ─────────────────────────────────────────────────────
select set_eq(
  $$ select c.column_name::text from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'company'
        and not has_column_privilege('authenticated', 'public.company', c.column_name, 'select') $$,
  array['wps_webhook_secret', 'contract_accepted_ip', 'wl_tenant_key', 'take_rate_bps'],
  'usuário logado não lê só as quatro colunas restritas (coluna nova sem grant cai aqui e reprova)'
);
select ok(
  has_table_privilege('authenticated', 'public.company', 'update')
  and has_table_privilege('authenticated', 'public.company', 'insert')
  and not has_table_privilege('authenticated', 'public.company', 'delete'),
  'logado mantém INSERT/UPDATE (com a RLS de hub_admin por trás) e perde DELETE');

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_company uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ccp-admin@ex.com',now(),now()),
    (v_cust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ccp-cust@ex.com',now(),now());
  insert into public.profiles(id, role) values (v_admin,'hub_admin'), (v_cust,'customer')
    on conflict (id) do update set role = excluded.role;
  insert into public.company(name, slug, wl_domain, wl_tenant_key, take_rate_bps, wps_webhook_secret)
    values ('CCP Parceiro', 'ccp-parceiro', 'ccp-app.movepark.co', 'ccp', 1500, 'segredo-de-teste')
    returning id into v_company;
  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.cust', v_cust::text, false);
  perform set_config('test.company', v_company::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'))::text, true);
select throws_ok(
  format($$ select public.manager_company_restricted(array[%L::uuid]) $$, current_setting('test.company')),
  '42501', null, 'cliente não lê os campos restritos pela RPC');
select throws_ok(
  $$ select wps_webhook_secret from public.company limit 1 $$,
  '42501', null, 'cliente não lê o segredo pelo PostgREST');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select is(
  (select take_rate_bps || '|' || wl_tenant_key || '|' || has_wps_webhook_secret
     from public.manager_company_restricted(array[current_setting('test.company')::uuid])),
  '1500|ccp|true', 'hub_admin lê comissão, tenant e se o segredo existe');
select ok(
  (select not ('wps_webhook_secret' = any (proargnames)) from pg_proc
    where proname = 'manager_company_restricted'),
  'o valor do segredo nunca sai pela RPC');
reset role;

-- ── 4. domínios ──────────────────────────────────────────────────────────────
select throws_ok(
  format($$ update public.company set wl_domain = '10.0.0.1' where id = %L $$, current_setting('test.company')),
  '23514', null, 'IP no domínio do WL é recusado');
select throws_ok(
  format($$ update public.company set wl_domain = 'evil.com:8443' where id = %L $$, current_setting('test.company')),
  '23514', null, 'porta no domínio do WL é recusada');
select throws_ok(
  format($$ update public.company set wl_public_domain = 'https://user@evil.com:8443/x' where id = %L $$, current_setting('test.company')),
  '23514', null, 'usuário@ e porta no domínio público são recusados');

-- ── 5. wl_company_config ─────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.cust'))::text, true);
select throws_ok(
  format($$ select * from public.wl_company_config(%L::uuid) $$, current_setting('test.company')),
  '42501', null, 'quem não tem occupancy:read na empresa não lê a config do WL');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin'))::text, true);
select is(
  (select wl_tenant_key from public.wl_company_config(current_setting('test.company')::uuid)),
  'ccp', 'hub_admin lê');
reset role;

select * from finish();
rollback;
