-- pgTAP: assistente da Automação v2 (migration 20261208100000_assistente_marketing_v2).
--   - escopo de plataforma do agente, fora dos papéis de empresa;
--   - o token resolve só válido, não vencido, não encerrado e de quem ainda é hub_admin;
--   - cada admin lê só as próprias propostas, e ninguém logado grava proposta.
-- Spec: docs/specs/assistente-marketing.md § 7. Transação + rollback.

begin;
select plan(9);

do $$
declare
  adm uuid := gen_random_uuid();
  outro uuid := gen_random_uuid();
  conv uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-v2-admin@ex.com', now(), now()),
           (outro, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mkt-v2-outro@ex.com', now(), now());
  insert into public.profiles(id, role) values (adm, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';
  insert into public.profiles(id, role) values (outro, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';

  insert into public.marketing_assist_session(token_hash, profile_id, conversa_id, expires_at)
    values ('hash-valido', adm, conv, now() + interval '30 minutes'),
           ('hash-vencido', adm, conv, now() - interval '1 minute'),
           ('hash-encerrado', adm, conv, now() + interval '30 minutes');
  update public.marketing_assist_session set ended_at = now() where token_hash = 'hash-encerrado';

  insert into public.marketing_assistant_action(profile_id, conversa_id, tool, args)
    values (adm, conv, 'marketing_run_campaign', '{"campaign_id":"x"}'),
           (outro, conv, 'marketing_set_dispatch_enabled', '{"enabled":true,"reason":"r"}');

  perform set_config('test.adm', adm::text, false);
  perform set_config('test.conv', conv::text, false);
end $$;

-- ── 1. Escopo ───────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.api_scope
    where scope = 'marketing:assist' and is_platform_scope and assignable_to_api_key),
  1, 'marketing:assist é de plataforma e atribuível a chave');
select is(
  (select count(*)::int from public.company_role_scope where scope = 'marketing:assist'),
  0, 'marketing:assist fica fora dos papéis de empresa');

-- ── 2. Resolve ──────────────────────────────────────────────────────────────
select is(public.marketing_assist_resolve('hash-valido') ->> 'ok', 'true', 'token válido resolve');
select is(public.marketing_assist_resolve('hash-valido') ->> 'conversa_id', current_setting('test.conv'),
  'devolve a conversa presa ao token');
select is(public.marketing_assist_resolve('hash-vencido') ->> 'reason', 'token_invalido', 'token vencido recusa');
select is(public.marketing_assist_resolve('hash-encerrado') ->> 'reason', 'token_invalido', 'token encerrado recusa');

update public.profiles set role = 'customer' where id = current_setting('test.adm')::uuid;
select is(public.marketing_assist_resolve('hash-valido') ->> 'reason', 'sem_papel',
  'quem deixou de ser hub_admin perde o acesso na hora');
update public.profiles set role = 'hub_admin' where id = current_setting('test.adm')::uuid;

-- ── 3. RLS das propostas ────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.adm'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.marketing_assistant_action), 1,
  'o admin só lê as próprias propostas');
select throws_ok(
  $$ insert into public.marketing_assistant_action(profile_id, conversa_id, tool)
     values (auth.uid(), gen_random_uuid(), 'marketing_run_campaign') $$,
  '42501', null, 'ninguém logado grava proposta');
reset role;

select * from finish();
rollback;
