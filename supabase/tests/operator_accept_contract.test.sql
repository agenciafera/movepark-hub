-- pgTAP: operator_accept_contract (E1.3 + prova do aceite de 27/09/2026).
--
-- Só o DONO da empresa assina (ADR-005). O aceite grava a prova: versão vigente, sha256 da
-- tabela `partner_contract_version`, quem aceitou (auth.uid()) e o primeiro IP do
-- `x-forwarded-for` que o PostgREST expõe em `request.headers`. Versão desconhecida ou
-- desatualizada é recusada (22023). Sem cabeçalho, o IP fica nulo.
begin;
select plan(10);

do $$
declare v_owner uuid := gen_random_uuid(); v_other uuid := gen_random_uuid(); v_co uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-c@ex.com', now(), now()),
    (v_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-c@ex.com', now(), now());
  insert into public.profiles(id, role) values (v_owner, 'company_operator'), (v_other, 'company_operator')
    on conflict (id) do nothing;
  insert into public.company(id, name, slug, status, onboarding_status)
    values (v_co, 'Contract Test Co', 'contract-test-' || substr(v_co::text, 1, 8), 'active', 'active');
  insert into public.profile_company(profile_id, company_id, role) values (v_owner, v_co, 'owner');
  perform set_config('t.owner', v_owner::text, false);
  perform set_config('t.other', v_other::text, false);
  perform set_config('t.co', v_co::text, false);
end $$;

-- 1) dono assina a versão vigente, com IP no cabeçalho
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.owner'))::text, true);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.1"}', true);
select lives_ok(
  format($$ select public.operator_accept_contract(%L, 'v1') $$, current_setting('t.co')),
  'dono assina a versão vigente sem erro');
reset role;

-- 2..6) a prova ficou gravada
select isnt(
  (select contract_accepted_at from public.company where id = current_setting('t.co')::uuid),
  null, 'contract_accepted_at foi gravado');
select is(
  (select contract_version from public.company where id = current_setting('t.co')::uuid),
  'v1', 'contract_version = versão vigente');
select is(
  (select contract_sha256 from public.company where id = current_setting('t.co')::uuid),
  (select sha256 from public.partner_contract_version where version = 'v1'),
  'contract_sha256 = hash da versão aceita (copiado da tabela)');
select is(
  (select contract_accepted_by from public.company where id = current_setting('t.co')::uuid),
  current_setting('t.owner')::uuid, 'contract_accepted_by = quem assinou (auth.uid())');
select is(
  (select host(contract_accepted_ip) from public.company where id = current_setting('t.co')::uuid),
  '203.0.113.9', 'contract_accepted_ip = primeiro endereço do x-forwarded-for');

-- 7) versão que não existe ou não é a vigente é recusada
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.owner'))::text, true);
select throws_ok(
  format($$ select public.operator_accept_contract(%L, 'v0') $$, current_setting('t.co')),
  '22023', null, 'versão desconhecida ou desatualizada é recusada (22023)');

-- 8) sem cabeçalho, o IP fica nulo (e o aceite continua valendo)
select set_config('request.headers', '', true);
select lives_ok(
  format($$ select public.operator_accept_contract(%L, 'v1') $$, current_setting('t.co')),
  'sem request.headers o aceite roda');
reset role;
select ok(
  (select contract_accepted_ip from public.company where id = current_setting('t.co')::uuid) is null,
  'sem x-forwarded-for, contract_accepted_ip fica nulo');

-- 10) não-dono é barrado (42501)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.other'))::text, true);
select throws_ok(
  format($$ select public.operator_accept_contract(%L, 'v1') $$, current_setting('t.co')),
  '42501', null, 'não-dono não pode assinar (42501)');
reset role;

select * from finish();
rollback;
