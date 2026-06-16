-- pgTAP: observabilidade da API/MCP (E0.7 Fase 1.1). Ver docs/specs/public-api.md §6.
-- api_request_log: escrita só via service_role (gateway); operator lê os próprios via
-- operator_api_usage + RLS. Roda em transação com rollback.

begin;
select plan(7);

do $$
declare u1 uuid := gen_random_uuid(); c1 uuid; u2 uuid := gen_random_uuid(); c2 uuid; k1 uuid;
begin
  c1 := public.submit_partner_lead('Log QA 1','Op1','log1@ex.com','+5511999990001','11111111000111');
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','log1@ex.com',now(),now());
  insert into public.profiles(id, role) values (u1,'company_operator') on conflict (id) do nothing;
  insert into public.profile_company(profile_id, company_id) values (u1, c1) on conflict do nothing;

  c2 := public.submit_partner_lead('Log QA 2','Op2','log2@ex.com','+5511999990002','22222222000122');
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','log2@ex.com',now(),now());
  insert into public.profiles(id, role) values (u2,'company_operator') on conflict (id) do nothing;
  insert into public.profile_company(profile_id, company_id) values (u2, c2) on conflict do nothing;

  insert into public.api_key(company_id,name,key_prefix,key_hash,environment,scopes)
    values (c1,'k','mp_test_logkey001','x','test',array['locations:read']) returning id into k1;

  -- 3 logs da empresa 1 (2 ok + 1 erro) + 1 log da empresa 2
  insert into public.api_request_log(api_key_id,company_id,surface,method,path,scope,status,latency_ms)
  values (k1,c1,'rest','GET','/v1/locations','locations:read',200,12),
         (k1,c1,'mcp','tools/call','list_locations','locations:read',200,20),
         (k1,c1,'rest','GET','/v1/bookings','bookings:read',403,5),
         (null,c2,'rest','GET','/v1/locations','locations:read',200,9);

  perform set_config('test.u1', u1::text, false);
  perform set_config('test.c1', c1::text, false);
  perform set_config('test.u2', u2::text, false);
  perform set_config('test.c2', c2::text, false);
end $$;

-- operator_api_usage (como op1): vê os 3 logs da empresa 1
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u1'))::text, false);
set local role authenticated;

select is(
  (public.operator_api_usage(current_setting('test.c1')::uuid)->'summary'->>'total')::int,
  3, 'summary.total conta os 3 logs da empresa');
select is(
  (public.operator_api_usage(current_setting('test.c1')::uuid)->'summary'->>'errors')::int,
  1, 'summary.errors conta o 403');
select is(
  jsonb_array_length(public.operator_api_usage(current_setting('test.c1')::uuid)->'recent'),
  3, 'recent traz as 3 linhas');
select cmp_ok(
  (public.operator_api_usage(current_setting('test.c1')::uuid)->'summary'->>'avg_latency_ms')::numeric,
  '>', 0::numeric, 'avg_latency_ms calculado');

-- RLS: op1 só enxerga os logs da própria empresa
select is(
  (select count(*)::int from public.api_request_log),
  3, 'RLS: op1 vê só os 3 da própria empresa (não o da empresa 2)');

-- cross-tenant: op2 não pode usar operator_api_usage na empresa 1
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u2'))::text, false);
select throws_ok(
  format($q$ select public.operator_api_usage(%L::uuid) $q$, current_setting('test.c1')),
  '42501', NULL, 'op de outra empresa é bloqueado (42501)');

-- e enxerga só o próprio log via RLS
select is((select count(*)::int from public.api_request_log), 1, 'RLS: op2 vê só o log da própria empresa');

reset role;
select * from finish();
rollback;
