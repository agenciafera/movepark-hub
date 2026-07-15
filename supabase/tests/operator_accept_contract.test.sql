-- pgTAP: operator_accept_contract (E1.3) — só o DONO da empresa assina o contrato (ADR-005).
-- Cobre: dono assina e grava contract_accepted_at; não-dono é barrado (42501).
-- NOTA: não rodado localmente (supabase CLI ausente no ambiente); validar no stack local (test:db).
begin;
select plan(3);

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

-- 1) dono assina sem erro
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.owner'))::text, true);
select lives_ok(
  format($$ select public.operator_accept_contract(%L, 'v1') $$, current_setting('t.co')),
  'dono assina o contrato sem erro');
reset role;

-- 2) contract_accepted_at ficou preenchido
select isnt(
  (select contract_accepted_at from public.company where id = current_setting('t.co')::uuid),
  null, 'contract_accepted_at foi gravado');

-- 3) não-dono é barrado (42501)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.other'))::text, true);
select throws_ok(
  format($$ select public.operator_accept_contract(%L, 'v1') $$, current_setting('t.co')),
  '42501', null, 'não-dono não pode assinar (42501)');
reset role;

select * from finish();
rollback;
