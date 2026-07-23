-- pgTAP: editor global de tarifas (ClickUp 86ajnxeym). A RPC admin_set_fare
-- escreve a tabela global public.fare e é gateada por is_hub_admin() no servidor
-- (ADR-005): nem o dono da empresa passa. Transação + rollback.

begin;
select plan(8);

select has_function('public', 'admin_set_fare', 'RPC admin_set_fare existe');

-- fixtures: um hub_admin, um customer e um dono de empresa
do $$
declare
  ua uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  uo uuid := gen_random_uuid();
  v_company uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-admin@ex.com',now(),now()),
    (uc,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-cust@ex.com',now(),now()),
    (uo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fare-owner2@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (ua,'hub_admin'),(uc,'customer'),(uo,'company_operator')
    on conflict (id) do nothing;
  select l.company_id into v_company from public.location l where l.deleted_at is null limit 1;
  insert into public.profile_company(profile_id, company_id, role) values (uo, v_company, 'owner');
  perform set_config('test.ua', ua::text, false);
  perform set_config('test.uc', uc::text, false);
  perform set_config('test.uo', uo::text, false);
end $$;

-- ── hub_admin grava ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);
select lives_ok(
  $$ select public.admin_set_fare('flex', 1990, true, true, 'Flex', 1, '{}'::jsonb, 1440) $$,
  'hub_admin grava a tarifa');
reset role;
select is((select price_cents from public.fare where tier='flex'), 1990,
  'preço da Flex atualizado para 1990');

-- Básica é sempre grátis: mesmo mandando 500, o preço fica 0.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);
select lives_ok(
  $$ select public.admin_set_fare('basica', 500, true, false, 'Básica', 0, '{}'::jsonb, 1440) $$,
  'hub_admin tenta cobrar pela Básica');
reset role;
select is((select price_cents from public.fare where tier='basica'), 0,
  'Básica continua grátis (0): o preço dela não é editável');

-- ── customer é barrado ───────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.uc'))::text, true);
select throws_ok(
  $$ select public.admin_set_fare('flex', 2000, true, true, 'Flex', 1, '{}'::jsonb, 1440) $$,
  '42501', null, 'customer não edita tarifa');
reset role;

-- ── dono de empresa é barrado (tarifa é da plataforma) ───────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.uo'))::text, true);
select throws_ok(
  $$ select public.admin_set_fare('flex', 2000, true, true, 'Flex', 1, '{}'::jsonb, 1440) $$,
  '42501', null, 'dono de empresa não edita tarifa (só a Movepark)');
reset role;

-- ── preço negativo é recusado ────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ua'))::text, true);
select throws_ok(
  $$ select public.admin_set_fare('flex', -1, true, true, 'Flex', 1, '{}'::jsonb, 1440) $$,
  'P0001', null, 'preço negativo é recusado');
reset role;

select * from finish();
rollback;
