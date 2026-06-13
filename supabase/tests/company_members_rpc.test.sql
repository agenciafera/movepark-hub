-- pgTAP: gestão de sub-papéis por empresa (E1.6) — company_role + RPCs de membros.
-- Cobre: default 'owner', listagem (owner/membro), guarda owner-only e guarda do
-- "último dono" em set_role/remove. Roda em transação com rollback.

begin;
select plan(11);

-- ── fixtures (como postgres; RLS/owner-check via auth.uid simulada) ─────────
do $$
declare
  uo   uuid := gen_random_uuid();  -- dono
  uop  uuid := gen_random_uuid();  -- operacional
  uop2 uuid := gen_random_uuid();  -- operacional 2
  uout uuid := gen_random_uuid();  -- de fora (não-membro)
  cid  uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (uo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','e16-owner@ex.com',now(),now()),
    (uop,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','e16-op@ex.com',now(),now()),
    (uop2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','e16-op2@ex.com',now(),now()),
    (uout,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','e16-out@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (uo,'company_operator'),(uop,'company_operator'),(uop2,'company_operator'),(uout,'company_operator')
    on conflict (id) do nothing;

  cid := public.submit_partner_lead('E16 Parceira','Dono E16','e16-owner@ex.com','+5511999990000');
  -- vínculos: uo dono (default), uop/uop2 operacional
  insert into public.profile_company(profile_id, company_id) values (uo, cid);
  insert into public.profile_company(profile_id, company_id, role) values
    (uop, cid, 'operator'), (uop2, cid, 'operator');

  perform set_config('test.uo', uo::text, false);
  perform set_config('test.uop', uop::text, false);
  perform set_config('test.uop2', uop2::text, false);
  perform set_config('test.uout', uout::text, false);
  perform set_config('test.cid', cid::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

set local role authenticated;

-- 0) default da coluna preserva acesso (vínculo simples vira 'owner')
select pg_temp.as_user(current_setting('test.uo'));
select is(
  (select role::text from public.company_list_members(current_setting('test.cid')::uuid)
     where profile_id = current_setting('test.uo')::uuid),
  'owner', 'vínculo sem role explícito nasce owner (default)');

-- 1) dono lista os 3 membros
select is(
  (select count(*)::int from public.company_list_members(current_setting('test.cid')::uuid)),
  3, 'dono lista os 3 membros da empresa');

-- 2) dono promove operacional → dono
select lives_ok(
  format($$select public.company_set_member_role(%L,%L,'owner')$$,
    current_setting('test.cid'), current_setting('test.uop')),
  'dono promove operacional a dono');
select is(
  (select role::text from public.company_list_members(current_setting('test.cid')::uuid)
     where profile_id = current_setting('test.uop')::uuid),
  'owner', 'papel do promovido virou owner');

-- 3) com 2 donos, rebaixar o dono original funciona
select lives_ok(
  format($$select public.company_set_member_role(%L,%L,'operator')$$,
    current_setting('test.cid'), current_setting('test.uo')),
  'rebaixa dono quando ainda há outro dono');

-- 4) agora uo é operacional → não pode gerir (owner-only)
select throws_ok(
  format($$select public.company_set_member_role(%L,%L,'owner')$$,
    current_setting('test.cid'), current_setting('test.uop2')),
  '42501', NULL, 'não-dono não consegue alterar papéis');

-- 5) uop é o único dono agora → rebaixar a si mesmo é bloqueado
select pg_temp.as_user(current_setting('test.uop'));
select throws_ok(
  format($$select public.company_set_member_role(%L,%L,'operator')$$,
    current_setting('test.cid'), current_setting('test.uop')),
  'P0001', NULL, 'não rebaixa o último dono');

-- 6) dono remove um operacional comum
select lives_ok(
  format($$select public.company_remove_member(%L,%L)$$,
    current_setting('test.cid'), current_setting('test.uop2')),
  'dono remove operacional');
select is(
  (select count(*)::int from public.company_list_members(current_setting('test.cid')::uuid)),
  2, 'após remoção restam 2 membros');

-- 7) remover o último dono é bloqueado
select throws_ok(
  format($$select public.company_remove_member(%L,%L)$$,
    current_setting('test.cid'), current_setting('test.uop')),
  'P0001', NULL, 'não remove o último dono');

-- 8) de fora não enxerga o roster
select pg_temp.as_user(current_setting('test.uout'));
select throws_ok(
  format($$select * from public.company_list_members(%L)$$, current_setting('test.cid')),
  '42501', NULL, 'não-membro não lista usuários da empresa');

reset role;
select finish();
rollback;
