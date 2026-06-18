-- pgTAP: E0.3.3 — payout_withdrawal. Enum, idempotência (unique provider+transfer), RLS
-- (operator lê só o seu e não escreve; hub_admin full; anon nada). Transação com rollback.

begin;
select plan(7);

do $$
declare
  op_a uuid := gen_random_uuid(); op_b uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  cid_a uuid; cid_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (op_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','w-a@ex.com',now(),now()),
    (op_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','w-b@ex.com',now(),now()),
    (adm ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','w-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (op_a,'company_operator'),(op_b,'company_operator'),(adm,'hub_admin') on conflict (id) do nothing;
  cid_a := public.submit_partner_lead('W Empresa A','Op A','w-a@ex.com','+5511999993001');
  cid_b := public.submit_partner_lead('W Empresa B','Op B','w-b@ex.com','+5511999993002');
  insert into public.profile_company(profile_id, company_id) values (op_a, cid_a), (op_b, cid_b);

  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, amount_cents, fee_cents, status, paid_at)
    values (cid_a,'pagarme','tr_1',20000,367,'paid','2026-05-30T10:00:00Z');
  insert into public.payout_withdrawal(company_id, provider, external_transfer_id, amount_cents, status)
    values (cid_b,'pagarme','tr_2',5000,'created');

  perform set_config('test.op_a', op_a::text, false);
  perform set_config('test.adm', adm::text, false);
  perform set_config('test.cid_a', cid_a::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true); end $$;

-- 1: enum com os 5 estados
select is(
  array(select enumlabel::text from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'payout_withdrawal_status' order by e.enumsortorder),
  array['created','processing','paid','failed','canceled'],
  'enum payout_withdrawal_status com os 5 estados');

-- 2: idempotência — segundo saque com mesmo (provider, transfer_id) → 23505
select throws_ok(
  $$ insert into public.payout_withdrawal(company_id, provider, external_transfer_id, amount_cents)
     values (current_setting('test.cid_a')::uuid, 'pagarme', 'tr_1', 20000) $$,
  '23505', null, 'unique (provider, external_transfer_id) bloqueia saque duplicado');

-- 3-4: RLS de SELECT (operador A só vê o seu)
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select is(
  (select count(*)::int from public.payout_withdrawal),
  1, 'operador A vê só o próprio saque');
select is(
  (select amount_cents from public.payout_withdrawal limit 1),
  20000, 'o saque visível é o da empresa A');
reset role;

-- 5: operador NÃO escreve (sem policy de insert)
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select throws_ok(
  $$ insert into public.payout_withdrawal(company_id, provider, external_transfer_id, amount_cents)
     values (current_setting('test.cid_a')::uuid, 'pagarme', 'tr_x', 100) $$,
  '42501', null, 'operador NÃO escreve saque (só service_role)');
reset role;

-- 6: hub_admin vê os 2
set local role authenticated;
select pg_temp.as_user(current_setting('test.adm'));
select is(
  (select count(*)::int from public.payout_withdrawal),
  2, 'hub_admin vê os 2 saques');
reset role;

-- 7: anon não vê nada
set local role anon;
select is_empty($$ select 1 from public.payout_withdrawal $$, 'anon NÃO vê saques');
reset role;

select * from finish();
rollback;
