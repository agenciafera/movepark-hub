-- Blog entra na base vetorizada (E3.3 / RAG).
--
-- Os 93 posts são ~380 KB de prosa respondendo exatamente o que o viajante
-- pergunta ("quanto custa a diária em Viracopos", "tem traslado", "é coberto").
-- As tools `search_blog`/`get_blog_post` cobrem busca literal; o RAG acha o mesmo
-- post por pergunta parafraseada, que é como a pessoa fala com o assistente.
--
-- Reusa o pipeline existente: fila por fonte, worker `knowledge-embed`, chunking
-- de prosa. A única novidade é o `source_type = 'blog_post'`.
--
-- Escopo: post com destino vira chunk `destination` (aparece na conversa daquele
-- aeroporto); post sem destino vira `global`.

-- ── 1. Fila: post mudou, reembeda ───────────────────────────────────────────
create or replace function public.blog_post_knowledge_enqueue()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_knowledge_resync('blog_post', old.id, 'delete');
    return old;
  end if;

  -- Despublicar ou excluir tira da base, igual a apagar.
  if new.deleted_at is not null or not new.is_published then
    perform public.enqueue_knowledge_resync('blog_post', new.id, 'delete');
    return new;
  end if;

  -- Só reembeda quando o que vira chunk mudou. Sem isto, trocar a capa ou o
  -- meta title custaria uma rodada de embedding do post inteiro.
  if tg_op = 'INSERT'
     or new.body_md is distinct from old.body_md
     or new.title is distinct from old.title
     or new.destination_id is distinct from old.destination_id
     or (old.deleted_at is not null or not old.is_published) then
    perform public.enqueue_knowledge_resync('blog_post', new.id, 'upsert');
  end if;
  return new;
end $$;

revoke all on function public.blog_post_knowledge_enqueue() from public, anon, authenticated;

drop trigger if exists blog_post_knowledge_enqueue on public.blog_post;
create trigger blog_post_knowledge_enqueue
  after insert or update or delete on public.blog_post
  for each row execute function public.blog_post_knowledge_enqueue();

-- ── 2. Busca não devolve trecho de post despublicado ─────────────────────────
-- Mesma trava que a `faq` já tinha. Sem ela, despublicar um post deixaria os
-- chunks respondendo no assistente até o worker drenar a fila.
create or replace function public.match_knowledge(
  p_query_embedding text,
  p_location_id uuid default null::uuid,
  p_destination_id uuid default null::uuid,
  p_k integer default 6
)
returns table(
  source_type text, source_id uuid, chunk_index integer, content text,
  scope faq_scope, location_id uuid, destination_id uuid, similarity double precision
)
language sql stable security definer set search_path to 'public, extensions'
as $function$
  with q as (
    select (p_query_embedding)::extensions.vector(768) as emb
  ),
  resolved as (
    select coalesce(
      p_destination_id,
      (select l.destination_id from public.location l where l.id = p_location_id)
    ) as dest_id
  )
  select
    k.source_type, k.source_id, k.chunk_index, k.content, k.scope,
    k.location_id, k.destination_id,
    1 - (k.embedding OPERATOR(extensions.<=>) q.emb) as similarity
  from public.knowledge_chunk k, q, resolved r
  where k.embedding is not null
    and not k.embedding_stale
    and (
      k.scope = 'global'
      or (k.scope = 'destination' and k.destination_id is not distinct from r.dest_id)
      or (k.scope = 'location'    and k.location_id    is not distinct from p_location_id)
    )
    and (
      k.source_type <> 'faq'
      or exists (
        select 1 from public.faq f
        where f.id = k.source_id and f.is_published and f.deleted_at is null
      )
    )
    and (
      k.source_type <> 'blog_post'
      or exists (
        select 1 from public.blog_post b
        where b.id = k.source_id and b.is_published and b.deleted_at is null
      )
    )
  order by k.embedding OPERATOR(extensions.<=>) q.emb
  limit greatest(1, least(coalesce(p_k, 6), 20));
$function$;

-- ── 3. Backfill dos 93 posts já publicados ──────────────────────────────────
insert into public.knowledge_source_queue (source_type, source_id, op)
select 'blog_post', b.id, 'upsert'
from public.blog_post b
where b.is_published and b.deleted_at is null
on conflict (source_type, source_id) do update
  set op = 'upsert', status = 'pending', attempts = 0, last_error = null;
