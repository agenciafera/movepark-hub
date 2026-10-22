-- Stories na fila do Instagram (E3.6, extensão de 22/10/2026).
--
-- Até aqui a fila só publicava no feed (decisão 4 da spec: "Reel e story ficam fora"). Em 22/10 o
-- post de Viracopos saiu no feed e o Kallef esperava vê-lo também nos stories. Decisões dele:
--   1. cada slide vira um story na versão vertical 9:16 (o slide inteiro no centro, sobre a própria
--      foto desfocada), gerada pela skill; um carrossel de 6 vira 6 stories em sequência;
--   2. o padrão de post novo é feed e stories, e o Manager troca post a post;
--   3. os stories de um post já publicado no feed podem sair depois.
--
-- A API da Meta publica story um por um (`media_type=STORIES`), sem `alt_text`, sem sticker de
-- link e sem carrossel. Por isso os stories têm estado próprio, ao lado do `status` do feed:
--   - `status` continua sendo o ciclo do post (aprovação, agenda, publicação). Com feed nos
--     lugares, ele acompanha o feed. Só com stories, `published` quer dizer que os stories saíram;
--   - `story_status` acompanha só os stories: nulo quando o post não vai para stories, e
--     `pending` → `publishing` → `published` | `failed`. Falha de story nunca mexe no feed;
--   - `story_items` guarda, por story, o envio (`container_id`) ANTES do media_publish e a mídia
--     (`media_id`) depois. É o que impede um story de sair duas vezes: nova tentativa consulta o
--     envio antes de criar outro.
--
-- Ver docs/specs/instagram-fila-de-publicacao.md.

alter table public.social_post
  add column placements text[] not null default '{feed}',
  add column story_slides jsonb not null default '[]'::jsonb,
  add column story_status text,
  add column story_items jsonb not null default '[]'::jsonb,
  add column story_error text,
  add column story_published_at timestamptz,
  add column story_claimed_at timestamptz;

alter table public.social_post
  add constraint social_post_placements_validos check (
    cardinality(placements) between 1 and 2 and placements <@ array['feed', 'story']::text[]
  ),
  add constraint social_post_story_slides_lista check (jsonb_typeof(story_slides) = 'array'),
  add constraint social_post_story_items_lista check (jsonb_typeof(story_items) = 'array'),
  add constraint social_post_story_status_valido check (
    story_status is null or story_status in ('pending', 'publishing', 'published', 'failed')
  ),
  -- Story nos lugares exige as imagens 9:16 e um estado; fora dos lugares, nenhum estado.
  add constraint social_post_story_coerente check (
    case when 'story' = any(placements)
      then jsonb_array_length(story_slides) between 1 and 10 and story_status is not null
      else story_status is null
    end
  );

comment on column public.social_post.placements is
  'Onde o post sai: feed, story ou os dois. Padrão da skill: os dois. Ver spec da fila.';
comment on column public.social_post.story_slides is
  'As imagens 9:16 dos stories, em ordem: [{url, path}]. Uma por slide.';
comment on column public.social_post.story_items is
  'Por story, na ordem de story_slides: {container_id, media_id}. container_id é gravado antes do media_publish.';

-- O rastro ganha as chamadas e os desfechos dos stories, e a troca de lugares.
alter table public.social_post_event drop constraint social_post_event_kind_check;
alter table public.social_post_event add constraint social_post_event_kind_check check (kind in (
  'draft_received', 'caption_edited', 'approved', 'rejected', 'rescheduled', 'dry_run',
  'container_child', 'container_parent', 'container_status', 'media_publish', 'permalink',
  'consulta', 'reconciled', 'overdue', 'failed', 'publish_now',
  'story_container', 'story_publish', 'story_published', 'story_failed', 'placements_edited'
));

-- Onde o post sai, editado no Manager. Vale para a versão que a pessoa abriu, e um post aprovado
-- volta para aprovação: quem aprovou viu outros lugares.
create function public.social_post_set_placements(
  p_id uuid,
  p_placements text[],
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
  novos text[];
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.updated_at is distinct from p_expected_updated_at then
    raise exception 'O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.'
      using errcode = 'P0001';
  end if;
  if p.status not in ('pending_review', 'approved', 'overdue', 'failed') then
    raise exception 'Não dá para mudar onde o post sai: ele já foi publicado, está sendo publicado ou foi recusado.'
      using errcode = 'P0001';
  end if;

  -- Ordem fixa e sem repetição, para a comparação e a tela.
  select coalesce(array_agg(l order by l), '{}') into novos
    from (select distinct unnest(p_placements) l) x;
  if cardinality(novos) = 0 then
    raise exception 'Escolha pelo menos um lugar: feed ou stories.' using errcode = 'P0001';
  end if;
  if not novos <@ array['feed', 'story']::text[] then
    raise exception 'Os lugares aceitos são feed e stories.' using errcode = 'P0001';
  end if;
  if 'story' = any(novos) and jsonb_array_length(p.story_slides) = 0 then
    raise exception 'Este post não tem as imagens dos stories. Reenvie pela skill para gerar as versões 9:16.'
      using errcode = 'P0001';
  end if;
  if novos = (select array_agg(l order by l) from unnest(p.placements) l) then
    return;
  end if;

  update public.social_post
     set placements = novos,
         story_status = case when 'story' = any(novos) then 'pending' end,
         story_items = '[]'::jsonb,
         story_error = null,
         status = case when p.status = 'approved' then 'pending_review' else p.status end,
         approved_by = case when p.status = 'approved' then null else p.approved_by end,
         approved_at = case when p.status = 'approved' then null else p.approved_at end
   where id = p_id;

  insert into public.social_post_event (social_post_id, kind, request, actor)
  values (p_id, 'placements_edited',
          jsonb_build_object('de', p.placements, 'para', novos, 'status_anterior', p.status),
          auth.uid());
end;
$$;

revoke all on function public.social_post_set_placements(uuid, text[], timestamptz) from public, anon;
grant execute on function public.social_post_set_placements(uuid, text[], timestamptz) to authenticated, service_role;

-- "Publicar agora" passa a aceitar também o post que já saiu no feed e tem stories pendentes ou
-- com falha: o clique publica só os stories. Nos outros casos, nada muda.
create or replace function public.social_post_publish_now(p_id uuid, p_expected_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.social_post;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para a fila do Instagram.' using errcode = '42501';
  end if;

  select * into p from public.social_post where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Post não encontrado.' using errcode = 'P0001';
  end if;
  if p.updated_at is distinct from p_expected_updated_at then
    raise exception 'O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.'
      using errcode = 'P0001';
  end if;

  -- Já publicado: só os stories que faltam.
  if p.status = 'published' then
    if p.story_status in ('pending', 'failed') then
      update public.social_post set story_status = 'pending', story_error = null where id = p_id;
      insert into public.social_post_event (social_post_id, kind, request, actor)
      values (p_id, 'publish_now',
              jsonb_build_object('status_anterior', p.status, 'stories', p.story_status), auth.uid());
      return;
    end if;
    raise exception 'Este post já foi publicado.' using errcode = 'P0001';
  end if;
  if p.status = 'publishing' then
    raise exception 'Este post já está sendo publicado.' using errcode = 'P0001';
  end if;
  if p.status = 'rejected' then
    raise exception 'Post recusado não pode ser publicado.' using errcode = 'P0001';
  end if;
  if p.status not in ('pending_review', 'approved', 'overdue', 'failed') then
    raise exception 'Este post não pode ser publicado agora (está %).', p.status using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p.validation -> 'blockers', '[]'::jsonb)) > 0 then
    raise exception 'O post tem bloqueios da conferência e não pode ser publicado.' using errcode = 'P0001';
  end if;
  -- Sem `social_post_day_taken` e sem exigir data futura: as duas regras são do agendamento.

  -- Vindo de `pending_review`, este clique é a aprovação. Nos outros estados alguém já aprovou, e
  -- essa aprovação fica; só se preenche o que estiver vazio. `ig_container_id` fica como está: é
  -- ele que faz a Edge consultar a Meta antes de criar outro envio.
  update public.social_post
     set status = 'approved',
         scheduled_at = now(),
         approved_by = case when p.status = 'pending_review' then auth.uid()
                            else coalesce(p.approved_by, auth.uid()) end,
         approved_at = case when p.status = 'pending_review' then now()
                            else coalesce(p.approved_at, now()) end,
         last_error = null
   where id = p_id;

  insert into public.social_post_event (social_post_id, kind, request, actor)
  values (p_id, 'publish_now',
          jsonb_build_object('status_anterior', p.status, 'de', p.scheduled_at, 'para', now()),
          auth.uid());
end;
$$;

revoke all on function public.social_post_publish_now(uuid, timestamptz) from public, anon;
grant execute on function public.social_post_publish_now(uuid, timestamptz) to authenticated, service_role;
