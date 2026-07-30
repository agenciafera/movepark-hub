-- pgTAP: meta de receita da empresa (Dashboard Operador v2).
--
-- ADR-005: escrita nova tem escopo próprio e o gate mora no servidor. `finance:write`
-- é de empresa (não vai pra chave de API) e pertence ao pacote de Gerente e Financeiro.
-- O papel Operação não define meta, porque não vê dinheiro.
-- Transação com rollback.

begin;
select plan(11);

select has_column('public', 'company', 'monthly_revenue_goal_cents',
  'company.monthly_revenue_goal_cents existe');
select has_function('public', 'operator_set_revenue_goal', ARRAY['uuid', 'integer'],
  'operator_set_revenue_goal(uuid, integer) existe');
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'operator_set_revenue_goal'),
  true, 'operator_set_revenue_goal é SECURITY DEFINER');

-- Escopo no catálogo, e fora do alcance de chave de API (é config de painel).
select is(
  (select assignable_to_api_key from public.api_scope where scope = 'finance:write'),
  false, 'finance:write NÃO é atribuível a chave de API');
select ok(
  exists(select 1 from public.company_role_scope where role = 'manager' and scope = 'finance:write'),
  'Gerente tem finance:write');
select ok(
  not exists(select 1 from public.company_role_scope where role = 'operator' and scope = 'finance:write'),
  'Operação NÃO tem finance:write (não vê dinheiro)');

select ok(not has_function_privilege('anon', 'public.operator_set_revenue_goal(uuid, integer)', 'EXECUTE'),
  'anon NÃO executa operator_set_revenue_goal');

-- ── Fixture: uma empresa, um dono e um membro de Operação ────────────────────
do $$
declare
  uo uuid := gen_random_uuid();
  up uuid := gen_random_uuid();
  v_company uuid;
  v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (uo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'goal-owner-' || v_code || '@ex.com', now(), now()),
    (up, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'goal-op-' || v_code || '@ex.com', now(), now());
  -- `do update`: o trigger on_auth_user_created já cria o profile como customer.
  insert into public.profiles(id, role) values (uo, 'company_operator'), (up, 'company_operator')
    on conflict (id) do update set role = excluded.role;

  insert into public.company (name, slug) values ('Goal Co', 'goal-co-' || v_code)
    returning id into v_company;
  insert into public.profile_company(profile_id, company_id, role) values
    (uo, v_company, 'owner'),
    (up, v_company, 'operator');

  perform set_config('test.owner', uo::text, false);
  perform set_config('test.op', up::text, false);
  perform set_config('test.company', v_company::text, false);
end $$;

-- ── Dono define a meta ───────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
select lives_ok(
  format($$ select public.operator_set_revenue_goal(%L::uuid, 40000) $$, current_setting('test.company')),
  'dono define a meta');
reset role;

select is(
  (select monthly_revenue_goal_cents from public.company where id = current_setting('test.company')::uuid),
  40000, 'meta gravada em centavos');

-- Zero limpa a meta em vez de gravar uma meta de R$ 0,00.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.owner'))::text, true);
select lives_ok(
  format($$ select public.operator_set_revenue_goal(%L::uuid, 0) $$, current_setting('test.company')),
  'dono zera a meta');
reset role;

select is(
  (select monthly_revenue_goal_cents from public.company where id = current_setting('test.company')::uuid),
  null, 'meta zerada volta a ser nula (sem meta), não R$ 0,00');

-- ── Operação é barrada ───────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.op'))::text, true);
select throws_ok(
  format($$ select public.operator_set_revenue_goal(%L::uuid, 99900) $$, current_setting('test.company')),
  '42501', null, 'papel Operação não define a meta');
reset role;

select * from finish();
rollback;
