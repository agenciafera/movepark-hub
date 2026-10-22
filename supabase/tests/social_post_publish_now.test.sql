-- pgTAP: "Publicar agora" da fila do Instagram (E3.6, extensão de 21/10/2026).
-- Migration: 20261130233000_social_post_publicar_agora.sql
-- Spec: docs/specs/instagram-fila-de-publicacao.md
--
-- A RPC `social_post_publish_now` não publica: deixa o post `approved` com a hora de agora e
-- registra o pedido. Quem publica é a Edge `social-dispatch`, no modo forçado. O que este arquivo
-- protege:
--   1. só hub_admin pede, e anon nem executa a função;
--   2. vale só para a versão que a pessoa viu, igual à aprovação;
--   3. post com bloqueio da conferência não sai;
--   4. a regra de um post por dia e a exigência de data futura NÃO valem aqui (decisão do Kallef);
--   5. post publicado, publicando ou recusado não volta para a fila por aqui;
--   6. o pedido fica no rastro com quem pediu, o estado e a hora de antes.
--
-- Roda em transação com rollback.

begin;
select plan(32);

-- Quem aprovou o post "d" antes de ele falhar. Criado aqui porque `approved_by` é FK de auth.users.
do $$
declare u uuid := 'f0000000-0000-4000-8000-0000000000f0';
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-primeiro@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';
end $$;

-- a: aguardando aprovação, limpo, daqui a 3 dias.
-- b: aguardando aprovação, com bloqueio.
-- c: publicado HOJE (fuso de São Paulo). Com a regra de um por dia, "a" não sairia hoje.
-- d: falhou, com container na Meta e aprovado por outra pessoa.
-- e: atrasado.
-- f: publicando agora.
-- g: recusado.
insert into public.social_post (id, draft_key, status, kind, caption, slides, scheduled_at, validation,
                                ig_container_id, ig_media_id, published_at, approved_by, approved_at, last_error)
values
  ('a0000000-0000-4000-8000-00000000000a', 'pgtap-agora-a:1', 'pending_review', 'image', 'Legenda a',
   '[{"url":"https://exemplo.co/a.jpg","path":"social/pgtap/a.jpg","alt":"pátio a","texto":null}]',
   now() + interval '3 days', '{"blockers":[],"warnings":[]}', null, null, null, null, null, null),
  ('b0000000-0000-4000-8000-00000000000b', 'pgtap-agora-b:1', 'pending_review', 'image', 'Legenda b',
   '[{"url":"https://exemplo.co/b.jpg","path":"social/pgtap/b.jpg","alt":"pátio b","texto":null}]',
   now() + interval '4 days', '{"blockers":["Promessa de transação na legenda: \"vaga garantida\" (ADR-009)."],"warnings":[]}',
   null, null, null, null, null, null),
  ('c0000000-0000-4000-8000-00000000000c', 'pgtap-agora-c:1', 'published', 'image', 'Legenda c',
   '[{"url":"https://exemplo.co/c.jpg","path":"social/pgtap/c.jpg","alt":"pátio c","texto":null}]',
   now() - interval '1 minute', '{"blockers":[],"warnings":[]}', 'container-c', 'midia-c', now(), null, null, null),
  ('d0000000-0000-4000-8000-00000000000d', 'pgtap-agora-d:1', 'failed', 'image', 'Legenda d',
   '[{"url":"https://exemplo.co/d.jpg","path":"social/pgtap/d.jpg","alt":"pátio d","texto":null}]',
   now() - interval '2 hours', '{"blockers":[],"warnings":[]}', 'container-d', null, null,
   'f0000000-0000-4000-8000-0000000000f0', now() - interval '1 day', 'Falhou ao publicar na Meta.'),
  ('e0000000-0000-4000-8000-00000000000e', 'pgtap-agora-e:1', 'overdue', 'image', 'Legenda e',
   '[{"url":"https://exemplo.co/e.jpg","path":"social/pgtap/e.jpg","alt":"pátio e","texto":null}]',
   now() - interval '2 days', '{"blockers":[],"warnings":[]}', null, null, null, null, null, null),
  ('f1000000-0000-4000-8000-00000000000f', 'pgtap-agora-f:1', 'publishing', 'image', 'Legenda f',
   '[{"url":"https://exemplo.co/f.jpg","path":"social/pgtap/f.jpg","alt":"pátio f","texto":null}]',
   now() - interval '1 minute', '{"blockers":[],"warnings":[]}', null, null, null, null, null, null),
  ('a1000000-0000-4000-8000-000000000001', 'pgtap-agora-g:1', 'rejected', 'image', 'Legenda g',
   '[{"url":"https://exemplo.co/g.jpg","path":"social/pgtap/g.jpg","alt":"pátio g","texto":null}]',
   now() + interval '5 days', '{"blockers":[],"warnings":[]}', null, null, null, null, null, null);

-- ── 1. estrutura e grants ───────────────────────────────────────────────────────────
select ok(to_regprocedure('public.social_post_publish_now(uuid, timestamp with time zone)') is not null, 'a RPC existe');
select is(has_function_privilege('anon', 'public.social_post_publish_now(uuid, timestamp with time zone)', 'execute'), false, 'anon não pede publicação');
select is(has_function_privilege('authenticated', 'public.social_post_publish_now(uuid, timestamp with time zone)', 'execute'), true, 'authenticated chama, e a RPC confere hub_admin dentro');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_post_event_kind_check') like '%publish_now%',
  'o rastro aceita o evento publish_now');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_post_event_kind_check') like '%dry_run%'
  and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_post_event_kind_check') like '%draft_received%'
  and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_post_event_kind_check') like '%reconciled%',
  'os eventos que já existiam continuam aceitos');

-- ── 2. quem não é hub_admin ─────────────────────────────────────────────────────────
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-agora-cliente@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer')
    on conflict (id) do update set role = 'customer';
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

select throws_ok(
  $$select public.social_post_publish_now('a0000000-0000-4000-8000-00000000000a', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$,
  '42501', null, 'quem não é hub_admin não pede publicação');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'pending_review', 'o pedido recusado não muda o post');

-- ── 3. hub_admin ────────────────────────────────────────────────────────────────────
do $$
declare u uuid := 'f2000000-0000-4000-8000-0000000000f2';
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-agora-admin@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

-- Versão que a pessoa abriu ficou para trás.
select throws_ok(
  $$select public.social_post_publish_now('a0000000-0000-4000-8000-00000000000a', now() - interval '1 day')$$,
  'P0001', 'O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.',
  'publicar com a versão velha é recusado');
select throws_ok(
  $$select public.social_post_publish_now('a0000000-0000-4000-8000-00000000000a', null)$$,
  'P0001', null, 'publicar sem dizer a versão também é recusado');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'pending_review', 'a versão velha não muda o post');

-- Bloqueio da conferência.
select throws_ok(
  $$select public.social_post_publish_now('b0000000-0000-4000-8000-00000000000b', (select updated_at from public.social_post where id = 'b0000000-0000-4000-8000-00000000000b'))$$,
  'P0001', 'O post tem bloqueios da conferência e não pode ser publicado.',
  'post com bloqueio não é publicado');

-- Aguardando aprovação, com data futura e outro post publicado hoje: vira aprovado para agora.
select lives_ok(
  $$select public.social_post_publish_now('a0000000-0000-4000-8000-00000000000a', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$,
  'publicar agora funciona mesmo com outro post publicado hoje e com a data no futuro');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'approved', 'o post fica aprovado');
select ok((select scheduled_at <= now() from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'a hora marcada passa a ser agora');
select is((select approved_by from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'f2000000-0000-4000-8000-0000000000f2'::uuid, 'quem pediu fica como quem aprovou');
select ok((select approved_at is not null from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'a hora da aprovação é gravada');
select ok(exists(
  select 1 from public.social_post_event
   where social_post_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'publish_now'
     and actor = 'f2000000-0000-4000-8000-0000000000f2'
     and request ->> 'status_anterior' = 'pending_review'
     and (request ->> 'de')::timestamptz = now() + interval '3 days'
), 'o pedido fica no rastro com quem pediu, o estado e a hora de antes');
select is((select count(*)::int from public.social_post_event where social_post_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'approved'), 0, 'o pedido não finge uma aprovação comum no rastro');

-- Falhou com container: volta para aprovado, guarda o container e quem aprovou primeiro.
select lives_ok(
  $$select public.social_post_publish_now('d0000000-0000-4000-8000-00000000000d', (select updated_at from public.social_post where id = 'd0000000-0000-4000-8000-00000000000d'))$$,
  'post que falhou pode ser publicado agora');
select is((select status::text from public.social_post where id = 'd0000000-0000-4000-8000-00000000000d'), 'approved', 'o que falhou volta para aprovado');
select is((select last_error from public.social_post where id = 'd0000000-0000-4000-8000-00000000000d'), null, 'o último erro é limpo');
select is((select ig_container_id from public.social_post where id = 'd0000000-0000-4000-8000-00000000000d'), 'container-d', 'o container fica: a Edge confere a Meta antes de criar outro');
select is((select approved_by from public.social_post where id = 'd0000000-0000-4000-8000-00000000000d'), 'f0000000-0000-4000-8000-0000000000f0'::uuid, 'quem aprovou antes continua como quem aprovou');
select ok((select approved_at < now() from public.social_post where id = 'd0000000-0000-4000-8000-00000000000d'), 'a hora da aprovação antiga também fica');

-- Atrasado.
select lives_ok(
  $$select public.social_post_publish_now('e0000000-0000-4000-8000-00000000000e', (select updated_at from public.social_post where id = 'e0000000-0000-4000-8000-00000000000e'))$$,
  'post atrasado pode ser publicado agora');
select is((select status::text from public.social_post where id = 'e0000000-0000-4000-8000-00000000000e'), 'approved', 'o atrasado volta para aprovado');
select is((select approved_by from public.social_post where id = 'e0000000-0000-4000-8000-00000000000e'), 'f2000000-0000-4000-8000-0000000000f2'::uuid, 'sem aprovação anterior, quem pediu fica como quem aprovou');

-- Estados que não voltam por aqui.
select throws_ok(
  $$select public.social_post_publish_now('c0000000-0000-4000-8000-00000000000c', (select updated_at from public.social_post where id = 'c0000000-0000-4000-8000-00000000000c'))$$,
  'P0001', 'Este post já foi publicado.', 'post publicado não sai de novo');
select throws_ok(
  $$select public.social_post_publish_now('f1000000-0000-4000-8000-00000000000f', (select updated_at from public.social_post where id = 'f1000000-0000-4000-8000-00000000000f'))$$,
  'P0001', 'Este post já está sendo publicado.', 'post publicando não é pedido de novo');
select throws_ok(
  $$select public.social_post_publish_now('a1000000-0000-4000-8000-000000000001', (select updated_at from public.social_post where id = 'a1000000-0000-4000-8000-000000000001'))$$,
  'P0001', 'Post recusado não pode ser publicado.', 'post recusado não é publicado');
select is((select status::text from public.social_post where id = 'c0000000-0000-4000-8000-00000000000c'), 'published', 'o publicado fica como está');
select throws_ok(
  $$select public.social_post_publish_now('00000000-0000-4000-8000-000000000000', now())$$,
  'P0001', 'Post não encontrado.', 'post que não existe');

select * from finish();
rollback;
