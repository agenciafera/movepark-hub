-- pgTAP: OPS-05 — buckets de Storage + RLS de storage.objects.
-- Verifica visibilidade/escopo por papel (anon / company_operator / hub_admin) e
-- a separação de prefixo por company_id. Roda em transação com rollback.

begin;
select plan(13);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
do $$
declare
  op_a uuid := gen_random_uuid();   -- operador da empresa A
  op_b uuid := gen_random_uuid();   -- operador da empresa B
  adm  uuid := gen_random_uuid();   -- hub_admin
  cid_a uuid;
  cid_b uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (op_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ops05-a@ex.com',now(),now()),
    (op_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ops05-b@ex.com',now(),now()),
    (adm ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ops05-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (op_a,'company_operator'),(op_b,'company_operator'),(adm,'hub_admin')
    on conflict (id) do nothing;

  cid_a := public.submit_partner_lead('OPS05 Empresa A','Op A','ops05-a@ex.com','+5511999990001');
  cid_b := public.submit_partner_lead('OPS05 Empresa B','Op B','ops05-b@ex.com','+5511999990002');
  insert into public.profile_company(profile_id, company_id) values (op_a, cid_a), (op_b, cid_b);

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

-- ── 1-3: buckets existem com o flag de visibilidade correto ──────────────────
select ok(
  (select public from storage.buckets where id = 'assets-public'),
  'assets-public é PÚBLICO');
select ok(
  not (select public from storage.buckets where id = 'vouchers'),
  'vouchers é PRIVADO');
select ok(
  not (select public from storage.buckets where id = 'partner-uploads'),
  'partner-uploads é PRIVADO');

-- ── assets-public: escrita por prefixo de empresa ────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));

select lives_ok(
  $$ insert into storage.objects(bucket_id, name)
     values ('assets-public', current_setting('test.cid_a') || '/logo.png') $$,
  'operador escreve em assets-public sob o prefixo da PRÓPRIA empresa');

select throws_ok(
  $$ insert into storage.objects(bucket_id, name)
     values ('assets-public', current_setting('test.cid_b') || '/logo.png') $$,
  '42501',
  null,
  'operador NÃO escreve sob o prefixo de OUTRA empresa');

select throws_ok(
  $$ insert into storage.objects(bucket_id, name)
     values ('assets-public', 'blog/post.png') $$,
  '42501',
  null,
  'operador NÃO escreve em prefixo administrativo (blog/)');

reset role;
set local role authenticated;
select pg_temp.as_user(current_setting('test.adm'));
select lives_ok(
  $$ insert into storage.objects(bucket_id, name)
     values ('assets-public', 'blog/post.png') $$,
  'hub_admin escreve em qualquer prefixo (blog/)');
reset role;

-- anon não escreve em assets-public (sem policy de insert p/ anon)
set local role anon;
select throws_ok(
  $$ insert into storage.objects(bucket_id, name)
     values ('assets-public', 'anon/x.png') $$,
  '42501',
  null,
  'anon NÃO escreve em assets-public');
reset role;

-- ── partner-uploads: privado, escopo por company_id ──────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select lives_ok(
  $$ insert into storage.objects(bucket_id, name)
     values ('partner-uploads', current_setting('test.cid_a') || '/contrato.pdf') $$,
  'operador escreve em partner-uploads sob a PRÓPRIA empresa');
select throws_ok(
  $$ insert into storage.objects(bucket_id, name)
     values ('partner-uploads', current_setting('test.cid_b') || '/contrato.pdf') $$,
  '42501',
  null,
  'operador NÃO escreve em partner-uploads de OUTRA empresa');
reset role;

-- operador B não enxerga o upload privado da empresa A
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_b'));
select is_empty(
  $$ select 1 from storage.objects
     where bucket_id = 'partner-uploads' and name like current_setting('test.cid_a') || '/%' $$,
  'operador NÃO vê uploads privados de outra empresa');
reset role;

-- hub_admin vê tudo em partner-uploads
set local role authenticated;
select pg_temp.as_user(current_setting('test.adm'));
select isnt_empty(
  $$ select 1 from storage.objects where bucket_id = 'partner-uploads' $$,
  'hub_admin vê uploads de qualquer empresa');
reset role;

-- anon não enxerga nada em partner-uploads (privado)
set local role anon;
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'partner-uploads' $$,
  'anon NÃO vê partner-uploads (privado)');
reset role;

select finish();
rollback;
