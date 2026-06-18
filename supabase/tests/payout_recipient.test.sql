-- pgTAP: E0.1.1 — recebedores/payout. Verifica enum, default de take_rate, unique por
-- (company,provider) e RLS (operator só lê o próprio e não escreve; hub_admin full).
-- Roda em transação com rollback.

begin;
select plan(11);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
do $$
declare
  op_a uuid := gen_random_uuid();
  op_b uuid := gen_random_uuid();
  adm  uuid := gen_random_uuid();
  cid_a uuid;
  cid_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (op_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay-a@ex.com',now(),now()),
    (op_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay-b@ex.com',now(),now()),
    (adm ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pay-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (op_a,'company_operator'),(op_b,'company_operator'),(adm,'hub_admin')
    on conflict (id) do nothing;

  cid_a := public.submit_partner_lead('Pay Empresa A','Op A','pay-a@ex.com','+5511999991001');
  cid_b := public.submit_partner_lead('Pay Empresa B','Op B','pay-b@ex.com','+5511999991002');
  insert into public.profile_company(profile_id, company_id) values (op_a, cid_a), (op_b, cid_b);

  -- recebedores e conta seedados como postgres (bypassa RLS)
  insert into public.payout_recipient(company_id, provider, status) values
    (cid_a, 'pagarme', 'draft'), (cid_b, 'pagarme', 'draft');
  insert into public.company_payout_account(company_id, legal_name) values (cid_a, 'A LTDA');

  perform set_config('test.op_a', op_a::text, false);
  perform set_config('test.op_b', op_b::text, false);
  perform set_config('test.adm',  adm::text,  false);
  perform set_config('test.cid_a', cid_a::text, false);
  perform set_config('test.cid_b', cid_b::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── 1: enum com os 6 estados, na ordem ───────────────────────────────────────
select is(
  array(select enumlabel::text from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'payout_recipient_status' order by e.enumsortorder),
  array['draft','pending','action_required','active','refused','suspended'],
  'enum payout_recipient_status tem os 6 estados na ordem');

-- ── 2: take_rate_bps default 1500 ────────────────────────────────────────────
select is(
  (select take_rate_bps from public.company where id = current_setting('test.cid_a')::uuid),
  1500,
  'company.take_rate_bps default = 1500');

-- ── 3: unique (company, provider) onde deleted_at is null ────────────────────
select throws_ok(
  $$ insert into public.payout_recipient(company_id, provider)
     values (current_setting('test.cid_a')::uuid, 'pagarme') $$,
  '23505',
  null,
  'unique (company,provider) bloqueia segundo recebedor vivo');

-- ── 4-6: RLS de SELECT no payout_recipient ───────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select is(
  (select count(*)::int from public.payout_recipient),
  1,
  'operador A vê só 1 recebedor (o próprio)');
select is(
  (select company_id from public.payout_recipient limit 1),
  current_setting('test.cid_a')::uuid,
  'o recebedor visível é o da empresa A');
select is_empty(
  $$ select 1 from public.payout_recipient
     where company_id = current_setting('test.cid_b')::uuid $$,
  'operador A NÃO vê recebedor da empresa B');
reset role;

-- ── 7: operador A não vê conta de payout de outra empresa ────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select is(
  (select count(*)::int from public.company_payout_account),
  1,
  'operador A vê só a própria company_payout_account');
reset role;

-- ── 8: operador A NÃO escreve recebedor (sem policy de insert) ───────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select throws_ok(
  $$ insert into public.payout_recipient(company_id, provider)
     values (current_setting('test.cid_a')::uuid, 'mock') $$,
  '42501',
  null,
  'operador NÃO insere recebedor (escrita só via service_role)');
reset role;

-- ── 9-10: hub_admin vê tudo e pode escrever ──────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.adm'));
select is(
  (select count(*)::int from public.payout_recipient),
  2,
  'hub_admin vê os 2 recebedores');
select lives_ok(
  $$ insert into public.payout_recipient(company_id, provider, status)
     values (current_setting('test.cid_a')::uuid, 'mock', 'draft') $$,
  'hub_admin insere recebedor');
reset role;

-- ── 11: anon não vê nada ─────────────────────────────────────────────────────
set local role anon;
select is_empty(
  $$ select 1 from public.payout_recipient $$,
  'anon NÃO vê recebedores');
reset role;

select * from finish();
rollback;
