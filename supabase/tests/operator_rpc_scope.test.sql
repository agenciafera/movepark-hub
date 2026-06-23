begin;
select plan(9);

-- Fixture: um usuário + empresa, papel variável. O insert em auth.users dispara o trigger que
-- cria o profile; por isso atualizamos (não inserimos) profiles. Tudo dentro do begin/rollback.
insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000bb', 'rpcscope@example.com');
update public.profiles set role = 'company_operator'
  where id = '00000000-0000-0000-0000-0000000000bb';
insert into public.company (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000cc', 'RpcScope', 'rpc-scope-test');
insert into public.profile_company (profile_id, company_id, role)
  values ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000cc', 'operator');

-- Simula o usuário logado (auth.uid()).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000bb', true);

-- ── Operação: tem reservas/check-in, NÃO tem preço/financeiro/usuários/chaves ──
select is(public.member_has_scope('00000000-0000-0000-0000-0000000000cc', 'bookings:checkin'), true,
  'operação tem bookings:checkin');
select is(public.member_has_scope('00000000-0000-0000-0000-0000000000cc', 'pricing:write'), false,
  'operação NÃO tem pricing:write');
select is(public.member_has_scope('00000000-0000-0000-0000-0000000000cc', 'finance:read'), false,
  'operação NÃO tem finance:read');
select is(public.member_has_scope('00000000-0000-0000-0000-0000000000cc', 'team:write'), false,
  'operação NÃO tem team:write');

-- RPC real bloqueia sem o escopo: gestão de membros exige team:write → 42501.
select throws_ok(
  $$ select public.company_set_member_role(
       '00000000-0000-0000-0000-0000000000cc',
       '00000000-0000-0000-0000-0000000000bb', 'manager') $$,
  '42501', null, 'company_set_member_role sem team:write → 42501'
);

-- ── Financeiro: tem finance:read, NÃO tem pricing:write ──
update public.profile_company set role = 'finance'
  where profile_id = '00000000-0000-0000-0000-0000000000bb';
select is(public.member_has_scope('00000000-0000-0000-0000-0000000000cc', 'finance:read'), true,
  'financeiro tem finance:read');
select is(public.member_has_scope('00000000-0000-0000-0000-0000000000cc', 'pricing:write'), false,
  'financeiro NÃO tem pricing:write');

-- ── Dono: tem tudo ──
update public.profile_company set role = 'owner'
  where profile_id = '00000000-0000-0000-0000-0000000000bb';
select is(public.member_has_scope('00000000-0000-0000-0000-0000000000cc', 'pricing:write'), true,
  'dono tem pricing:write');
select is(public.member_has_scope('00000000-0000-0000-0000-0000000000cc', 'api-keys:write'), true,
  'dono tem api-keys:write');

select * from finish();
rollback;
