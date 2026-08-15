-- pgTAP: Go2Park na unidade (transfer com rastreio ao vivo).
-- Spec: docs/specs/go2park-transfer-ao-vivo.md
--
-- O que este arquivo protege: o selo é contrato comercial da Movepark, não configuração do
-- parceiro. Quem tem `locations:write` edita a unidade inteira pelo PostgREST, então a única
-- barreira que vale é a do banco. Sem este teste, a regra some no primeiro `create or replace`.

begin;
select plan(7);

-- ── fixtures (como postgres; RLS não se aplica) ────────────────────────────
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_gerente uuid := gen_random_uuid();
  v_company uuid;
  v_loc uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','g2p-admin@ex.com',now(),now()),
    (v_gerente,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','g2p-gerente@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (v_admin,'hub_admin'), (v_gerente,'company_operator') on conflict (id) do nothing;

  insert into public.company(name, slug) values ('G2P Parceiro','g2p-parceiro')
    returning id into v_company;

  insert into public.profile_company(profile_id, company_id, role)
    values (v_gerente, v_company, 'manager');

  insert into public.location(company_id, name, slug)
    values (v_company, 'G2P Unidade', 'g2p-unidade') returning id into v_loc;

  perform set_config('test.admin', v_admin::text, false);
  perform set_config('test.gerente', v_gerente::text, false);
  perform set_config('test.loc', v_loc::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- ── estrutura ──────────────────────────────────────────────────────────────
select has_column('public','location','go2park_enabled','location.go2park_enabled existe');

select is(
  (select go2park_enabled from public.location where id = current_setting('test.loc')::uuid),
  false, 'unidade nasce sem Go2Park (o contrato é a exceção, não o padrão)'
);

-- A função-guarda não é SECURITY DEFINER e não é executável por cliente.
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'location_go2park_guard'),
  false, 'a guarda não precisa (nem usa) SECURITY DEFINER'
);
select ok(
  not has_function_privilege('authenticated', 'public.location_go2park_guard()', 'EXECUTE'),
  'authenticated não executa a função-trigger'
);

-- ── quem liga ──────────────────────────────────────────────────────────────
-- O gerente tem locations:write e edita a unidade, mas não este campo.
select pg_temp.as_user(current_setting('test.gerente'));
select throws_ok(
  format($$ update public.location set go2park_enabled = true where id = %L $$, current_setting('test.loc')),
  '42501', null, 'parceiro com locations:write não liga o Go2Park sozinho'
);

select pg_temp.as_user(current_setting('test.admin'));
select lives_ok(
  format($$ update public.location set go2park_enabled = true where id = %L $$, current_setting('test.loc')),
  'hub_admin liga o Go2Park'
);

-- Update que não toca a coluna passa por qualquer um: o trigger recusa a MUDANÇA, não a edição
-- da unidade. Sem esta trava, ligar o selo travaria o parceiro de editar nome e endereço.
select pg_temp.as_user(current_setting('test.gerente'));
select lives_ok(
  format($$ update public.location set name = 'G2P Unidade renomeada' where id = %L $$, current_setting('test.loc')),
  'com o selo ligado, o parceiro segue editando o resto da unidade'
);

select * from finish();
rollback;
