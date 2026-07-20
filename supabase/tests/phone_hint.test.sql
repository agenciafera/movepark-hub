-- pgTAP: ADR-006 — set_phone_hint() guarda o telefone como DICA (não credencial).
-- Cobre: grava em profiles.preferences.unverified_phone_hint do próprio usuário; preserva as
-- outras chaves de preferences (não clobber); não toca auth.users.phone; guarda "não autenticado";
-- não é executável por anon. Roda com: supabase test db (stack local). Transação + rollback.

begin;
select plan(7);

-- ── Fixture: 1 usuário com uma preferência prévia ───────────────────────────
do $$
declare
  u1 uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hint-u1@ex.com',now(),now());
  insert into public.profiles(id, role, preferences) values
    (u1,'customer','{"theme":"dark"}'::jsonb)
  on conflict (id) do update set preferences = excluded.preferences;
  perform set_config('test.u1', u1::text, true);
end $$;

-- A função existe e é security definer.
select has_function('public','set_phone_hint', array['text'], 'set_phone_hint(text) existe');
select is(
  (select prosecdef from pg_proc where proname = 'set_phone_hint'),
  true,
  'set_phone_hint é SECURITY DEFINER'
);

-- anon NÃO pode executar (só authenticated/service_role).
select ok(
  not has_function_privilege('anon', 'public.set_phone_hint(text)', 'execute'),
  'anon não executa set_phone_hint'
);

-- ── Executa como u1 ──────────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.u1'))::text, true);
select set_phone_hint('+5511987654321');

select is(
  (select preferences->>'unverified_phone_hint' from public.profiles where id = current_setting('test.u1')::uuid),
  '+5511987654321',
  'grava a dica em preferences.unverified_phone_hint'
);

-- Não clobber: a preferência prévia continua lá.
select is(
  (select preferences->>'theme' from public.profiles where id = current_setting('test.u1')::uuid),
  'dark',
  'preserva as outras chaves de preferences'
);

-- Não promove a credencial: auth.users.phone segue nulo.
select is(
  (select phone from auth.users where id = current_setting('test.u1')::uuid),
  null,
  'não escreve auth.users.phone (não é credencial)'
);

-- Guarda de sessão: sem sub → 42501.
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select public.set_phone_hint('+5511999998888') $$,
  '42501',
  null,
  'sem auth.uid() → não autenticado'
);

select * from finish();
rollback;
