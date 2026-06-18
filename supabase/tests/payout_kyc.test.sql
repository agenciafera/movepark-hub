-- pgTAP: E1.3 — RPC onboarding_upsert_payout_account. Operador salva o KYC do próprio recebedor
-- (status editável), grava colunas planas + kyc_details e bumpa o passo 6; outro operador é barrado.
-- Roda em transação com rollback.

begin;
select plan(6);

do $$
declare
  op_a uuid := gen_random_uuid();
  op_b uuid := gen_random_uuid();
  cid_a uuid;
  cid_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (op_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','kyc-a@ex.com',now(),now()),
    (op_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','kyc-b@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (op_a,'company_operator'),(op_b,'company_operator') on conflict (id) do nothing;

  cid_a := public.submit_partner_lead('KYC Empresa A','Op A','kyc-a@ex.com','+5511999992001');
  cid_b := public.submit_partner_lead('KYC Empresa B','Op B','kyc-b@ex.com','+5511999992002');
  insert into public.profile_company(profile_id, company_id) values (op_a, cid_a), (op_b, cid_b);

  -- precisa estar em fase de edição (approved/in_progress) para o assert_editable liberar
  update public.company set onboarding_status = 'approved' where id in (cid_a, cid_b);

  perform set_config('test.op_a', op_a::text, false);
  perform set_config('test.op_b', op_b::text, false);
  perform set_config('test.cid_a', cid_a::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));

-- 1: operador dono faz o upsert
select lives_ok(
  $$ select public.onboarding_upsert_payout_account(
       current_setting('test.cid_a')::uuid,
       jsonb_build_object(
         'legal_name','Estac LTDA',
         'document','11222333000181',
         'document_type','cnpj',
         'bank_code','341','branch_number','1234','account_number','67890',
         'account_check_digit','1','account_type','checking','holder_name','Estac LTDA',
         'holder_document','11222333000181',
         'kyc_details', jsonb_build_object('email','contato@estac.com','annual_revenue',1000000)
       )
     ) $$,
  'operador dono faz upsert da conta de repasse');

reset role;

-- 2-4: gravou colunas + kyc_details + bumpou o passo (como postgres, sem RLS)
select is(
  (select document from public.company_payout_account where company_id = current_setting('test.cid_a')::uuid),
  '11222333000181', 'gravou o documento');
select is(
  (select kyc_details->>'email' from public.company_payout_account where company_id = current_setting('test.cid_a')::uuid),
  'contato@estac.com', 'gravou kyc_details.email');
select ok(
  (select current_step from public.company_onboarding where company_id = current_setting('test.cid_a')::uuid) >= 6,
  'bumpou o passo para >= 6');

-- 5: re-upsert atualiza (idempotente por company_id)
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select lives_ok(
  $$ select public.onboarding_upsert_payout_account(
       current_setting('test.cid_a')::uuid,
       jsonb_build_object('legal_name','Estac LTDA 2','document','11222333000181','document_type','cnpj')
     ) $$,
  're-upsert do dono atualiza sem erro');
reset role;

-- 6: operador de OUTRA empresa não pode salvar nesta
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_b'));
select throws_ok(
  $$ select public.onboarding_upsert_payout_account(
       current_setting('test.cid_a')::uuid,
       jsonb_build_object('legal_name','Hacker')
     ) $$,
  '42501', null,
  'operador de outra empresa é barrado');
reset role;

select * from finish();
rollback;
