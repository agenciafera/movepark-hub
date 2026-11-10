-- Reel na fila do Instagram (E3.6, extensão de 10/11/2026).
--
-- Até aqui a fila publicava foto, carrossel e story, e o reel saía pelo app (decisão 4 da spec).
-- Em 10/11 o Diego pediu que os reels editados com a skill video-use passem pela fila, com
-- aprovação, agenda e rastro, como os outros posts. O que muda no banco:
--
--   - `kind = 'reel'` (migration anterior) e a coluna `video`, com o MP4 já no bucket:
--     { url, path, bytes, duracao_s, largura, altura }. O reel guarda a capa em `slides`, como
--     slide único: é ela que a prévia, a grade do perfil e a conferência de texto já leem;
--   - reel sai só no feed (e na aba de reels). Story de vídeo fica fora;
--   - o bucket `social-video`, público como o `assets-public`, porque a Meta busca o vídeo pela
--     URL. O `assets-public` não serve: aceita só imagem e no máximo 10 MB. Ninguém escreve nele
--     pelo cliente: o envio é por URL assinada que só a Edge `social-draft` emite;
--   - o rastro ganha `reel_processing`: a Meta demora a processar vídeo, e quando ela não termina
--     dentro da chamada o post volta para `approved` com o envio guardado, e a próxima tentativa
--     publica esse mesmo envio, sem criar outro.
--
-- Ver docs/specs/instagram-fila-de-publicacao.md, decisão 11.

alter table public.social_post
  add column if not exists video jsonb;

comment on column public.social_post.video is
  'Só no reel: o MP4 no bucket social-video, { url, path, bytes, duracao_s, largura, altura }. A capa fica em slides[0].';

alter table public.social_post drop constraint if exists social_post_video_objeto;
alter table public.social_post add constraint social_post_video_objeto check (
  video is null or (jsonb_typeof(video) = 'object' and video ? 'url' and video ? 'path')
);

-- O tipo bate com o conteúdo. A comparação é por texto: o valor 'reel' nasceu na migration
-- anterior, e a regra fica legível sem depender de cast.
alter table public.social_post drop constraint if exists social_post_kind_bate;
alter table public.social_post add constraint social_post_kind_bate check (
  case kind::text
    when 'image' then jsonb_array_length(slides) = 1 and video is null
    when 'carousel' then jsonb_array_length(slides) > 1 and video is null
    when 'reel' then jsonb_array_length(slides) = 1 and video is not null
      and placements = array['feed']::text[]
    else false
  end
);

alter table public.social_post_event drop constraint if exists social_post_event_kind_check;
alter table public.social_post_event add constraint social_post_event_kind_check check (kind in (
  'draft_received', 'caption_edited', 'approved', 'rejected', 'rescheduled', 'dry_run',
  'container_child', 'container_parent', 'container_status', 'media_publish', 'permalink',
  'consulta', 'reconciled', 'overdue', 'failed', 'publish_now',
  'story_container', 'story_publish', 'story_published', 'story_failed', 'placements_edited',
  'reel_processing'
));

-- ── O bucket do vídeo ────────────────────────────────────────────────────────────────────
-- 300 MB é o teto da Meta para reel. Sem policy: o bucket público serve a leitura, e a escrita
-- é só pela URL assinada que a Edge emite com a service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-video', 'social-video', true, 314572800, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
