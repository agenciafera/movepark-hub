-- pgTAP: reel na fila do Instagram (E3.6, extensão de 10/11/2026).
-- Migrations: 20261202090000_social_post_kind_reel.sql + 20261202090500_social_post_reel.sql
-- Spec: docs/specs/instagram-fila-de-publicacao.md, decisão 11
--
-- O que este arquivo protege:
--   1. reel exige o vídeo e a capa como slide único, e sai só no feed;
--   2. foto e carrossel não carregam vídeo, e a regra antiga (1 slide = foto) continua valendo;
--   3. o rastro aceita `reel_processing`;
--   4. o bucket do vídeo é público, aceita só vídeo e vai até 300 MB.
--
-- Roda em transação com rollback.

begin;
select plan(11);

-- Monta um post do tipo pedido. `video` nulo e `placements` só feed por padrão.
create function pg_temp.post(p_key text, p_kind text, p_slides int, p_video jsonb,
                             p_placements text[] default '{feed}')
returns void language sql as $$
  insert into public.social_post (draft_key, kind, caption, slides, scheduled_at, placements, video)
  select p_key, p_kind::public.social_post_kind, 'Legenda',
         (select jsonb_agg(jsonb_build_object('url', 'https://exemplo.co/' || i || '.jpg',
                                              'path', 'social/pgtap/' || i || '.jpg',
                                              'alt', null, 'texto', null))
            from generate_series(1, p_slides) i),
         now() + interval '3 days', p_placements, p_video;
$$;

create function pg_temp.video() returns jsonb language sql as $$
  select '{"url":"https://exemplo.co/social-video/r.mp4","path":"social/pgtap/r.mp4","bytes":10,"duracao_s":47.5,"largura":1080,"altura":1920}'::jsonb
$$;

select lives_ok($$ select pg_temp.post('pgtap-reel-ok:1', 'reel', 1, pg_temp.video()) $$,
  'reel com vídeo e capa entra');
select throws_ok($$ select pg_temp.post('pgtap-reel-sem-video:1', 'reel', 1, null) $$,
  '23514', null, 'reel sem vídeo é recusado');
select throws_ok($$ select pg_temp.post('pgtap-reel-2-slides:1', 'reel', 2, pg_temp.video()) $$,
  '23514', null, 'reel com dois slides é recusado: a capa é o slide único');
select throws_ok($$ select pg_temp.post('pgtap-reel-story:1', 'reel', 1, pg_temp.video(), '{feed,story}') $$,
  '23514', null, 'reel nos stories é recusado');
select throws_ok($$ select pg_temp.post('pgtap-reel-video-ruim:1', 'reel', 1, '"x"'::jsonb) $$,
  '23514', null, 'vídeo que não é objeto com url e path é recusado');

select throws_ok($$ select pg_temp.post('pgtap-foto-video:1', 'image', 1, pg_temp.video()) $$,
  '23514', null, 'foto com vídeo é recusada');
select throws_ok($$ select pg_temp.post('pgtap-carrossel-1:1', 'carousel', 1, null) $$,
  '23514', null, 'carrossel de um slide continua recusado');
select lives_ok($$ select pg_temp.post('pgtap-carrossel-ok:1', 'carousel', 3, null) $$,
  'carrossel sem vídeo continua entrando');

select lives_ok($$
  insert into public.social_post_event (social_post_id, kind, note)
  select id, 'reel_processing', 'A Meta ainda está processando o vídeo.'
    from public.social_post where draft_key = 'pgtap-reel-ok:1'
$$, 'o rastro aceita reel_processing');

select results_eq(
  $$ select public, file_size_limit from storage.buckets where id = 'social-video' $$,
  $$ values (true, 314572800::bigint) $$,
  'o bucket do vídeo é público e vai até 300 MB'
);
select results_eq(
  $$ select allowed_mime_types from storage.buckets where id = 'social-video' $$,
  $$ values (array['video/mp4', 'video/quicktime']::text[]) $$,
  'o bucket do vídeo aceita só vídeo'
);

select * from finish();
rollback;
