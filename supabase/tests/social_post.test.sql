-- pgTAP: fila de publicação do Instagram (E3.6).
-- Migrations: 20261130180000_social_post.sql, 20261130230000_social_post_approve_versao.sql
-- Spec: docs/specs/instagram-fila-de-publicacao.md
--
-- O que este arquivo protege, em ordem de importância:
--   1. só hub_admin lê a fila, e cliente nenhum escreve direto nela: o que sai daqui é
--      publicação pública com a marca da Movepark;
--   2. post com bloqueio da conferência, ou com a data já passada, não é aprovado;
--   3. dois posts no mesmo dia, no fuso de São Paulo, não convivem (a regra da skill);
--   4. reagendar devolve à fila o post atrasado;
--   5. recusa exige motivo;
--   6. as RPCs não são executáveis por anon, e a auxiliar de dia não sai do servidor;
--   7. aprovar vale só para a versão que a pessoa viu: se o post mudou desde que ela abriu, a RPC
--      recusa (migration 20261130230000).
--
-- Roda em transação com rollback.

begin;
select plan(27);

-- Três posts: "a" limpo daqui a 3 dias ao meio-dia, "b" com bloqueio, "c" no mesmo dia de "a".
insert into public.social_post (id, draft_key, kind, caption, slides, scheduled_at, validation)
values
  ('a0000000-0000-4000-8000-00000000000a', 'pgtap-a:1', 'image', 'Legenda do post a',
   '[{"url":"https://exemplo.co/a.jpg","path":"social/pgtap/a.jpg","alt":"pátio a","texto":null}]',
   (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '3 days 12 hours') at time zone 'America/Sao_Paulo',
   '{"blockers":[],"warnings":[]}'),
  ('b0000000-0000-4000-8000-00000000000b', 'pgtap-b:1', 'image', 'Legenda do post b',
   '[{"url":"https://exemplo.co/b.jpg","path":"social/pgtap/b.jpg","alt":"pátio b","texto":null}]',
   (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '6 days 12 hours') at time zone 'America/Sao_Paulo',
   '{"blockers":["Promessa de transação na legenda: \"vaga garantida\" (ADR-009)."],"warnings":[]}'),
  ('c0000000-0000-4000-8000-00000000000c', 'pgtap-c:1', 'image', 'Legenda do post c',
   '[{"url":"https://exemplo.co/c.jpg","path":"social/pgtap/c.jpg","alt":"pátio c","texto":null}]',
   (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '3 days 15 hours') at time zone 'America/Sao_Paulo',
   '{"blockers":[],"warnings":[]}');

-- ── 1. estrutura ────────────────────────────────────────────────────────────────────
select has_table('public', 'social_post', 'a fila existe');
select has_table('public', 'social_post_event', 'o rastro existe');
select ok((select relrowsecurity from pg_class where oid = 'public.social_post'::regclass), 'a fila tem RLS ligada');
select ok((select relrowsecurity from pg_class where oid = 'public.social_post_event'::regclass), 'o rastro tem RLS ligada');
select is(has_function_privilege('anon', 'public.social_post_approve(uuid, timestamp with time zone)', 'execute'), false, 'anon não aprova post');
select is(to_regprocedure('public.social_post_approve(uuid)') is null, true, 'a assinatura antiga, sem a versão, não existe mais');
select is(has_function_privilege('authenticated', 'public.social_post_day_taken(uuid, timestamp with time zone)', 'execute'), false, 'a auxiliar de dia não é chamável pelo cliente');
select is((select value from public.app_setting where key = 'social_dispatch_enabled'), 'false', 'a publicação automática nasce desligada');

-- ── 2. quem não é hub_admin ─────────────────────────────────────────────────────────
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-cliente@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer')
    on conflict (id) do update set role = 'customer';
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

select throws_ok($$select public.social_post_approve('a0000000-0000-4000-8000-00000000000a', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$, '42501', null, 'quem não é hub_admin não aprova');

set local role authenticated;
select is((select count(*)::int from public.social_post), 0, 'quem não é hub_admin não enxerga a fila');
select throws_ok(
  $$insert into public.social_post (draft_key, kind, caption, slides, scheduled_at) values ('pgtap-x:1', 'image', 'x', '[{"url":"u"}]', now() + interval '1 day')$$,
  '42501', null, 'cliente nenhum escreve direto na fila');
reset role;

-- ── 3. hub_admin ────────────────────────────────────────────────────────────────────
-- Usuário criado aqui: a RPC lê o papel do profiles, não do JWT.
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-admin@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

set local role authenticated;
select is((select count(*)::int from public.social_post where draft_key like 'pgtap-%'), 3, 'hub_admin enxerga a fila');
reset role;

-- A versão que a pessoa abriu ficou para trás: a aprovação é recusada e o post segue esperando.
select throws_ok(
  $$select public.social_post_approve('a0000000-0000-4000-8000-00000000000a', now() - interval '1 day')$$,
  'P0001', 'O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.',
  'aprovar com a versão velha é recusado');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'pending_review', 'a aprovação recusada por versão velha não muda o post');
select throws_ok(
  $$select public.social_post_approve('a0000000-0000-4000-8000-00000000000a', null)$$,
  'P0001', null, 'aprovar sem dizer a versão também é recusado');

select lives_ok($$select public.social_post_approve('a0000000-0000-4000-8000-00000000000a', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$, 'hub_admin aprova post limpo com data futura, na versão que viu');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'approved', 'o post aprovado fica approved');
select ok(exists(select 1 from public.social_post_event where social_post_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'approved' and actor is not null), 'a aprovação fica no rastro com quem aprovou');
select throws_ok($$select public.social_post_approve('b0000000-0000-4000-8000-00000000000b', (select updated_at from public.social_post where id = 'b0000000-0000-4000-8000-00000000000b'))$$, 'P0001', null, 'post com bloqueio da conferência não é aprovado');
select throws_ok($$select public.social_post_approve('c0000000-0000-4000-8000-00000000000c', (select updated_at from public.social_post where id = 'c0000000-0000-4000-8000-00000000000c'))$$, 'P0001', null, 'dois posts no mesmo dia não convivem');
select throws_ok($$select public.social_post_reschedule('c0000000-0000-4000-8000-00000000000c', now() - interval '1 hour')$$, 'P0001', null, 'reagendar para o passado é recusado');
select lives_ok($$select public.social_post_reschedule('c0000000-0000-4000-8000-00000000000c', (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '4 days 12 hours') at time zone 'America/Sao_Paulo')$$, 'reagendar para um dia livre funciona');

update public.social_post set status = 'overdue' where id = 'a0000000-0000-4000-8000-00000000000a';
select lives_ok($$select public.social_post_reschedule('a0000000-0000-4000-8000-00000000000a', (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '5 days 12 hours') at time zone 'America/Sao_Paulo')$$, 'post atrasado é reagendado');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'approved', 'reagendar o atrasado devolve ele à fila de publicação');

select throws_ok($$select public.social_post_reject('b0000000-0000-4000-8000-00000000000b', '  ')$$, 'P0001', null, 'recusa sem motivo é recusada');
select lives_ok($$select public.social_post_reject('b0000000-0000-4000-8000-00000000000b', 'foto com carro antigo')$$, 'recusa com motivo funciona');
select is((select status::text from public.social_post where id = 'b0000000-0000-4000-8000-00000000000b'), 'rejected', 'o post recusado fica rejected');

select * from finish();
rollback;
