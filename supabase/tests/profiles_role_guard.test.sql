-- pgTAP: `profiles.role` não é gravável por quem ele autoriza.
-- Migration: 20261017103000_profiles_role_not_self_writable.sql
--
-- A falha que este arquivo fecha: `authenticated` tinha UPDATE na tabela inteira (grant default
-- do Supabase) e as policies de UPDATE dizem "o dono edita a própria linha". Policy corta LINHA,
-- não COLUNA, então o dono editava a linha inteira, `role` incluída, e qualquer conta criada no
-- `/login` virava `hub_admin` com um PATCH no próprio perfil.
--
-- Por isso as asserções vêm em dois níveis. As de `has_column_privilege` são o guard de
-- regressão barato: um `grant update on public.profiles to authenticated` numa migration futura
-- reabre tudo em silêncio, e é aqui que ele aparece. As de comportamento provam que o grant
-- realmente barra o caminho do PostgREST e que o caminho legítimo continua aberto, que é a parte
-- que quebra na vida real quando alguém fecha coluna demais.

begin;
select plan(16);

-- ── fixtures (como postgres; RLS não se aplica a superuser) ──────────────────
do $$
declare
  ucust uuid := gen_random_uuid();   -- cliente logado qualquer
  uadm  uuid := gen_random_uuid();   -- hub_admin
  ualvo uuid := gen_random_uuid();   -- terceiro, o alvo legítimo da promoção
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (ucust,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','role-guard-cust@ex.com',now(),now()),
    (uadm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','role-guard-adm@ex.com', now(),now()),
    (ualvo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','role-guard-alvo@ex.com',now(),now());

  -- `do update`, não `do nothing`: onde o trigger de auth.users existe (o banco vivo tem; o
  -- stack local não, porque o dump do baseline não leva o schema `auth`) a linha já nasceu como
  -- `customer`, e um `do nothing` deixaria o admin sem o papel.
  insert into public.profiles(id, role, first_name) values
    (ucust,'customer','Cliente'),
    (uadm, 'hub_admin','Admin'),
    (ualvo,'customer','Alvo')
    on conflict (id) do update set role = excluded.role, first_name = excluded.first_name;

  perform set_config('test.ucust', ucust::text, false);
  perform set_config('test.uadm',  uadm::text,  false);
  perform set_config('test.ualvo', ualvo::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

-- ── 1. O grant, que é onde a regra realmente mora ────────────────────────────

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'),
  'authenticated NÃO tem update na coluna role (é a falha de escalada que isto fecha)');

select ok(
  not has_column_privilege('anon', 'public.profiles', 'role', 'update'),
  'anon NÃO tem update na coluna role');

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'deleted_at', 'update'),
  'authenticated NÃO tem update em deleted_at (apagar conta é a RPC de anonimização)');

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'first_name', 'update'),
  'authenticated MANTÉM update em first_name (a tela da conta não pode quebrar)');

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'preferences', 'update'),
  'authenticated MANTÉM update em preferences');

-- ── 2. O comportamento, pelo caminho que o PostgREST usa ─────────────────────

set local role authenticated;
select pg_temp.as_user(current_setting('test.ucust'));

select throws_ok(
  format($$update public.profiles set role = 'hub_admin' where id = %L$$,
         current_setting('test.ucust')),
  '42501', null,
  'customer NÃO consegue se promover a hub_admin editando o próprio perfil');

select lives_ok(
  format($$update public.profiles set first_name = 'Editado' where id = %L$$,
         current_setting('test.ucust')),
  'customer continua editando o próprio nome');

select lives_ok(
  format($$update public.profiles set preferences = '{"a":1}'::jsonb where id = %L$$,
         current_setting('test.ucust')),
  'customer continua editando as próprias preferências');

select throws_ok(
  format($$update public.profiles set deleted_at = now() where id = %L$$,
         current_setting('test.ucust')),
  '42501', null,
  'customer NÃO apaga a própria conta por fora da RPC');

-- A ponta que fecha o círculo: sem a escalada, o gate de hub_admin segue de pé.
select throws_ok(
  $$select * from public.manager_prospect_locations()$$,
  '42501', null,
  'customer segue recusado nas RPCs de hub_admin');

select throws_ok(
  format($$select public.admin_set_user_role(%L::uuid, 'hub_admin')$$,
         current_setting('test.ucust')),
  '42501', null,
  'customer NÃO usa a RPC de papel para se promover');

reset role;

-- ── 3. O caminho legítimo: o Manager troca papel de terceiro ─────────────────

set local role authenticated;
select pg_temp.as_user(current_setting('test.uadm'));

select lives_ok(
  format($$select public.admin_set_user_role(%L::uuid, 'company_operator')$$,
         current_setting('test.ualvo')),
  'hub_admin troca o papel de outra pessoa pela RPC');

select is(
  (select role::text from public.profiles where id = current_setting('test.ualvo')::uuid),
  'company_operator',
  'e o papel novo ficou gravado');

select throws_ok(
  format($$select public.admin_set_user_role(%L::uuid, 'customer')$$,
         current_setting('test.uadm')),
  'P0001', 'Ninguém altera o próprio papel: peça a outro administrador.',
  'nem o hub_admin altera o próprio papel (o último a se rebaixar tranca o painel)');

select throws_ok(
  $$select public.admin_set_user_role('00000000-0000-4000-8000-0000000000ff'::uuid, 'customer')$$,
  'P0001', 'Usuário não encontrado.',
  'uuid que não existe falha limpo, em vez de passar batido');

reset role;

-- ── 4. Quem alcança a RPC nova ───────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.admin_set_user_role(uuid, public.user_role)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_set_user_role(uuid, public.user_role)', 'execute'),
  'admin_set_user_role: anon não executa, authenticated executa');

select * from finish();
rollback;
