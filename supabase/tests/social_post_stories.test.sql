-- pgTAP: stories na fila do Instagram (E3.6, extensão de 22/10/2026).
-- Migration: 20261130240000_social_post_stories.sql
-- Spec: docs/specs/instagram-fila-de-publicacao.md
--
-- O que este arquivo protege:
--   1. "onde sai" só aceita feed e story, e story exige as imagens 9:16 e um estado próprio;
--   2. só hub_admin troca os lugares, na versão que abriu, e um post aprovado volta para aprovação;
--   3. post publicado, publicando ou recusado não troca de lugar;
--   4. "Publicar agora" num post que já saiu no feed publica só os stories que faltam.
--
-- Roda em transação com rollback.

begin;
select plan(31);

do $$
declare u uuid := 'f0000000-0000-4000-8000-0000000000f0';
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-stories-aprovou@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';
end $$;

-- a: aprovado, só feed, com as imagens dos stories.
-- b: aguardando aprovação, sem imagens de story.
-- c: publicado no feed, stories pendentes.
-- d: publicado no feed e nos stories.
-- e: publicado, só feed.
-- f: publicado no feed, stories com falha.
insert into public.social_post (id, draft_key, status, kind, caption, slides, scheduled_at, validation,
                                placements, story_slides, story_status, story_error,
                                ig_media_id, published_at, approved_by, approved_at)
values
  ('a0000000-0000-4000-8000-00000000000a', 'pgtap-story-a:1', 'approved', 'image', 'Legenda a',
   '[{"url":"https://exemplo.co/a.jpg","path":"social/pgtap/a.jpg","alt":"pátio a","texto":null}]',
   now() + interval '3 days', '{"blockers":[],"warnings":[]}', '{feed}',
   '[{"url":"https://exemplo.co/a-story.jpg","path":"social/pgtap/a-story.jpg"}]', null, null,
   null, null, 'f0000000-0000-4000-8000-0000000000f0', now()),
  ('b0000000-0000-4000-8000-00000000000b', 'pgtap-story-b:1', 'pending_review', 'image', 'Legenda b',
   '[{"url":"https://exemplo.co/b.jpg","path":"social/pgtap/b.jpg","alt":"pátio b","texto":null}]',
   now() + interval '4 days', '{"blockers":[],"warnings":[]}', '{feed}', '[]', null, null,
   null, null, null, null),
  ('c0000000-0000-4000-8000-00000000000c', 'pgtap-story-c:1', 'published', 'image', 'Legenda c',
   '[{"url":"https://exemplo.co/c.jpg","path":"social/pgtap/c.jpg","alt":"pátio c","texto":null}]',
   now() - interval '1 hour', '{"blockers":[],"warnings":[]}', '{feed,story}',
   '[{"url":"https://exemplo.co/c-story.jpg","path":"social/pgtap/c-story.jpg"}]', 'pending', null,
   'midia-c', now(), null, null),
  ('d0000000-0000-4000-8000-00000000000d', 'pgtap-story-d:1', 'published', 'image', 'Legenda d',
   '[{"url":"https://exemplo.co/d.jpg","path":"social/pgtap/d.jpg","alt":"pátio d","texto":null}]',
   now() - interval '1 hour', '{"blockers":[],"warnings":[]}', '{feed,story}',
   '[{"url":"https://exemplo.co/d-story.jpg","path":"social/pgtap/d-story.jpg"}]', 'published', null,
   'midia-d', now(), null, null),
  ('e0000000-0000-4000-8000-00000000000e', 'pgtap-story-e:1', 'published', 'image', 'Legenda e',
   '[{"url":"https://exemplo.co/e.jpg","path":"social/pgtap/e.jpg","alt":"pátio e","texto":null}]',
   now() - interval '1 hour', '{"blockers":[],"warnings":[]}', '{feed}',
   '[{"url":"https://exemplo.co/e-story.jpg","path":"social/pgtap/e-story.jpg"}]', null, null,
   'midia-e', now(), null, null),
  ('f1000000-0000-4000-8000-00000000000f', 'pgtap-story-f:1', 'published', 'image', 'Legenda f',
   '[{"url":"https://exemplo.co/f.jpg","path":"social/pgtap/f.jpg","alt":"pátio f","texto":null}]',
   now() - interval '1 hour', '{"blockers":[],"warnings":[]}', '{feed,story}',
   '[{"url":"https://exemplo.co/f-story.jpg","path":"social/pgtap/f-story.jpg"}]', 'failed',
   'A Meta recusou o story 2.', 'midia-f', now(), null, null);

-- ── 1. estrutura ────────────────────────────────────────────────────────────────────
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'social_post' and column_name = 'placements'),
  '''{feed}''::text[]', 'post criado por outro caminho sai só no feed');
select throws_ok(
  $$update public.social_post set placements = '{feed,story}', story_status = 'pending' where id = 'b0000000-0000-4000-8000-00000000000b'$$,
  '23514', null, 'story nos lugares sem as imagens 9:16 é recusado pelo banco');
select throws_ok(
  $$update public.social_post set placements = '{feed,reel}' where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'só feed e story são lugares válidos');
select throws_ok(
  $$update public.social_post set story_status = 'pending' where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'fora dos stories, o post não tem estado de story');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_post_event_kind_check') like '%story_publish%'
  and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_post_event_kind_check') like '%placements_edited%'
  and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_post_event_kind_check') like '%publish_now%',
  'o rastro aceita os eventos dos stories e continua aceitando os antigos');
select is(has_function_privilege('anon', 'public.social_post_set_placements(uuid, text[], timestamp with time zone)', 'execute'), false, 'anon não troca os lugares');
select is(has_function_privilege('authenticated', 'public.social_post_set_placements(uuid, text[], timestamp with time zone)', 'execute'), true, 'authenticated chama, e a RPC confere hub_admin dentro');

-- ── 2. quem não é hub_admin ─────────────────────────────────────────────────────────
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-stories-cliente@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'customer')
    on conflict (id) do update set role = 'customer';
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

select throws_ok(
  $$select public.social_post_set_placements('a0000000-0000-4000-8000-00000000000a', '{feed,story}', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$,
  '42501', null, 'quem não é hub_admin não troca os lugares');

-- ── 3. hub_admin ────────────────────────────────────────────────────────────────────
do $$
declare u uuid := 'f2000000-0000-4000-8000-0000000000f2';
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'social-stories-admin@ex.com', now(), now());
  insert into public.profiles(id, role) values (u, 'hub_admin')
    on conflict (id) do update set role = 'hub_admin';
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $$;

select throws_ok(
  $$select public.social_post_set_placements('a0000000-0000-4000-8000-00000000000a', '{feed,story}', now() - interval '1 day')$$,
  'P0001', 'O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.',
  'trocar com a versão velha é recusado');
select throws_ok(
  $$select public.social_post_set_placements('b0000000-0000-4000-8000-00000000000b', '{story}', (select updated_at from public.social_post where id = 'b0000000-0000-4000-8000-00000000000b'))$$,
  'P0001', 'Este post não tem as imagens dos stories. Reenvie pela skill para gerar as versões 9:16.',
  'story sem as imagens 9:16 é recusado com o caminho para resolver');
select throws_ok(
  $$select public.social_post_set_placements('a0000000-0000-4000-8000-00000000000a', '{}', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$,
  'P0001', 'Escolha pelo menos um lugar: feed ou stories.', 'nenhum lugar é recusado');
select throws_ok(
  $$select public.social_post_set_placements('a0000000-0000-4000-8000-00000000000a', '{reel}', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$,
  'P0001', 'Os lugares aceitos são feed e stories.', 'lugar desconhecido é recusado');
select throws_ok(
  $$select public.social_post_set_placements('e0000000-0000-4000-8000-00000000000e', '{feed,story}', (select updated_at from public.social_post where id = 'e0000000-0000-4000-8000-00000000000e'))$$,
  'P0001', null, 'post publicado não troca de lugar');

-- Aprovado, só feed → feed e stories: volta para aprovação, stories pendentes.
select lives_ok(
  $$select public.social_post_set_placements('a0000000-0000-4000-8000-00000000000a', '{story,feed,story}', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$,
  'hub_admin troca para feed e stories');
select is((select placements from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), '{feed,story}'::text[], 'os lugares ficam em ordem e sem repetição');
select is((select story_status from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'pending', 'os stories nascem pendentes');
select is((select status::text from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), 'pending_review', 'o post aprovado volta para aprovação');
select is((select approved_by from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), null, 'a aprovação antiga é apagada');
select ok(exists(
  select 1 from public.social_post_event
   where social_post_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'placements_edited'
     and actor = 'f2000000-0000-4000-8000-0000000000f2'
     and request -> 'de' = '["feed"]'::jsonb and request -> 'para' = '["feed","story"]'::jsonb
), 'a troca fica no rastro com quem trocou, de onde e para onde');

-- Tirar os stories: o estado de story some.
select lives_ok(
  $$select public.social_post_set_placements('a0000000-0000-4000-8000-00000000000a', '{feed}', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$,
  'hub_admin volta para só feed');
select is((select story_status from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'), null, 'sem stories, sem estado de story');

-- Mesmos lugares de antes: nada muda, nem o rastro.
select lives_ok(
  $$select public.social_post_set_placements('a0000000-0000-4000-8000-00000000000a', '{feed}', (select updated_at from public.social_post where id = 'a0000000-0000-4000-8000-00000000000a'))$$,
  'repetir os lugares não é erro');
select is((select count(*)::int from public.social_post_event where social_post_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'placements_edited'), 2, 'repetir os lugares não grava evento');

-- ── 4. "Publicar agora" num post que já saiu no feed ────────────────────────────────
select lives_ok(
  $$select public.social_post_publish_now('c0000000-0000-4000-8000-00000000000c', (select updated_at from public.social_post where id = 'c0000000-0000-4000-8000-00000000000c'))$$,
  'publicado no feed com stories pendentes: publicar agora vale para os stories');
select is((select status::text from public.social_post where id = 'c0000000-0000-4000-8000-00000000000c'), 'published', 'o feed continua publicado');
select is((select story_status from public.social_post where id = 'c0000000-0000-4000-8000-00000000000c'), 'pending', 'os stories ficam pendentes para a Edge');
select lives_ok(
  $$select public.social_post_publish_now('f1000000-0000-4000-8000-00000000000f', (select updated_at from public.social_post where id = 'f1000000-0000-4000-8000-00000000000f'))$$,
  'stories com falha podem ser publicados de novo');
select is((select story_error from public.social_post where id = 'f1000000-0000-4000-8000-00000000000f'), null, 'o erro dos stories é limpo');
select is((select story_status from public.social_post where id = 'f1000000-0000-4000-8000-00000000000f'), 'pending', 'os stories com falha voltam a pendentes');
select throws_ok(
  $$select public.social_post_publish_now('d0000000-0000-4000-8000-00000000000d', (select updated_at from public.social_post where id = 'd0000000-0000-4000-8000-00000000000d'))$$,
  'P0001', 'Este post já foi publicado.', 'feed e stories publicados: nada sai de novo');
select throws_ok(
  $$select public.social_post_publish_now('e0000000-0000-4000-8000-00000000000e', (select updated_at from public.social_post where id = 'e0000000-0000-4000-8000-00000000000e'))$$,
  'P0001', 'Este post já foi publicado.', 'publicado só no feed: nada sai de novo');

select * from finish();
rollback;
