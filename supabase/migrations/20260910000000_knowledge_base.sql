-- E3.3 / base de conhecimento (RAG nativo). Ver docs/specs/knowledge-base.md e ADR-002.
--
-- Traz a busca semântica do atendimento para dentro do Hub (hoje no Notion + Dify). Vetoriza só a
-- PROSA (faq das 3 camadas + directions_text/notice/reservation_policy da location + notes de
-- amenidade); o dado estruturado (endereço, contato, translado, preço, capacidade) já é servido
-- on-the-fly pelo get-faq (scope='auto'), então NÃO entra aqui.
--
-- Esta é a FUNDAÇÃO (F1): extensão pgvector, a tabela de chunks, o índice HNSW e a RPC de busca. O
-- pipeline de frescor (fila + triggers + Edge worker + cron) e a tool de leitura vêm nas migrations
-- seguintes. A tabela é interna: RLS ligada + ZERO policies (molde checkout_handoff), e toda leitura
-- pública passa pela RPC security definer que aplica o filtro de escopo do ADR-002. É a barreira
-- anti-vazamento multi-tenant: o anon nunca faz select direto em knowledge_chunk.

-- 1) Extensão vetorial no schema `extensions` (mesma convenção do pg_trgm).
create extension if not exists vector with schema extensions;

-- 2) Tabela de chunks. FK polimórfica leve (source_type, source_id) para não poluir faq/location com
--    uma coluna de 768 floats. content_hash dá idempotência de reembedding (pular chunk igual).
--    ATENÇÃO: a dimensão 768 (Gemini gemini-embedding-001 com outputDimensionality=768) fica CRAVADA na coluna e no índice HNSW.
--    Trocar de modelo (outra dimensão) exige recriar coluna + índice + rebackfill.
create table if not exists public.knowledge_chunk (
  id              uuid primary key default gen_random_uuid(),
  source_type     text not null,            -- 'faq' | 'location_directions' | 'location_notice' | 'location_policy' | 'location_amenity'
  source_id       uuid not null,            -- faq.id ; ou location.id (directions/notice/policy/amenity — amenity não tem id próprio, key por location)
  chunk_index     integer not null default 0,
  scope           public.faq_scope not null,-- reusa o enum: global | destination | location
  location_id     uuid references public.location(id) on delete cascade,
  destination_id  uuid references public.destination(id) on delete cascade,
  content         text not null,
  content_hash    text not null,            -- sha256(content) hex
  token_estimate  integer,
  embedding       extensions.vector(768),
  embedding_stale boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (source_type, source_id, chunk_index)
);

comment on table public.knowledge_chunk is
  'Chunks de prosa vetorizados para RAG (E3.3). Interna: só service_role escreve; leitura via match_knowledge.';

alter table public.knowledge_chunk enable row level security;
-- Sem policies: RLS ligada + zero policies = só service_role toca. O anon lê exclusivamente pela RPC.

-- Índice vetorial HNSW cosine: build-once, aceita insert incremental, melhor recall em base
-- pequena/média (vs IVFFlat, que precisa treinar listas e reconstruir conforme cresce).
create index if not exists knowledge_chunk_embedding_hnsw
  on public.knowledge_chunk using hnsw (embedding extensions.vector_cosine_ops);

-- Índice parcial para o worker achar o que reembeddar (molde wps_delivery_pending_idx).
create index if not exists knowledge_chunk_stale_idx
  on public.knowledge_chunk (embedding_stale) where embedding_stale;

create index if not exists knowledge_chunk_source_idx
  on public.knowledge_chunk (source_type, source_id);

create index if not exists knowledge_chunk_scope_idx
  on public.knowledge_chunk (scope, location_id, destination_id);

create trigger knowledge_chunk_set_updated_at
  before update on public.knowledge_chunk
  for each row execute function public.set_updated_at();

-- 3) Busca semântica com filtro de escopo do ADR-002 (global sempre; destination do destino herdado
--    da location, igual get-faq; location da unidade). is_published da faq respeitado (cinto-e-
--    suspensório: o worker já só embeda faq publicada). Ordena por distância cosseno (<=>).
--    O embedding entra como TEXT (o array JSON) e é cast para vector aqui — evita depender do
--    marshaling de tipo vetorial do PostgREST na assinatura da RPC.
create or replace function public.match_knowledge(
  p_query_embedding text,
  p_location_id     uuid default null,
  p_destination_id  uuid default null,
  p_k               integer default 6
) returns table (
  source_type    text,
  source_id      uuid,
  chunk_index    integer,
  content        text,
  scope          public.faq_scope,
  location_id    uuid,
  destination_id uuid,
  similarity     double precision
)
language sql
stable
security definer
set search_path to 'public, extensions'
as $$
  with q as (
    select (p_query_embedding)::extensions.vector(768) as emb
  ),
  resolved as (
    -- herda o destino da location quando não vem explícito (mesma lógica do get-faq)
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
  order by k.embedding OPERATOR(extensions.<=>) q.emb
  limit greatest(1, least(coalesce(p_k, 6), 20));
$$;

-- A RPC é a única porta de leitura: anon/authenticated executam a função, mas NÃO leem a tabela.
revoke all on function public.match_knowledge(text, uuid, uuid, integer) from public;
grant execute on function public.match_knowledge(text, uuid, uuid, integer) to anon, authenticated, service_role;
