-- match_knowledge: filtrar o escopo ANTES de ranquear por distância.
--
-- ## O defeito
--
-- A versão anterior deixava o `order by embedding <=> query` livre, e com isso o planner usava o
-- índice HNSW. HNSW é busca aproximada: ele caminha o grafo, colhe os `hnsw.ef_search` vizinhos
-- mais próximos (default 40) e SÓ ENTÃO o `where` de escopo roda sobre esses 40. Quando o filtro é
-- seletivo, ele derruba candidatos que o índice já tinha escolhido, e o resultado encolhe ou zera.
-- Não é o filtro que está errado: é a ordem em que as duas coisas acontecem.
--
-- Medido em produção em 19/08/2026, com 409 chunks:
--
--   • "onde espero a van em Viracopos?" na Edge publicada devolvia ZERO trechos. A pergunta é
--     semanticamente colada nos 400 chunks de destino, então os 40 vizinhos eram todos de destino;
--     como a pergunta chegou sem `destination_id`, o filtro só admitia os 8 globais, e os 40
--     candidatos morreram inteiros.
--   • A mesma consulta pedindo k=6 com 8 globais elegíveis devolvia 4 linhas com o ef_search
--     padrão e 6 com ef_search=1000. Mesma consulta, mesma base, resposta diferente: a assinatura
--     de recall perdido por pós-filtro.
--
-- O caso sem contexto não é raro, é a porta de entrada: `location_id` e `destination_id` são
-- opcionais na tool `search_knowledge` e quem pergunta escreve "Viracopos", não um uuid. A primeira
-- chamada de uma conversa quase sempre vai sem contexto, que é justo o cenário em que 401 dos 409
-- chunks são inelegíveis e o pós-filtro é mais destrutivo.
--
-- ## A correção
--
-- `elegiveis` vira CTE `materialized`, que é uma barreira de otimização: o Postgres resolve o
-- conjunto elegível primeiro, com o índice btree `knowledge_chunk_scope_idx` que já existe, e só
-- depois ordena por distância sobre esse conjunto. A ordenação passa a ser exata, não aproximada,
-- e o recall vira 100% por construção: k linhas sempre que existirem k elegíveis.
--
-- Custa uma varredura do conjunto elegível, e é barato porque o filtro de escopo é seletivo por
-- natureza: uma pergunta vê no máximo (globais + os chunks de UM destino + os de UMA unidade). Hoje
-- isso é ~25 linhas de 409. Enquanto esse conjunto couber em alguns milhares, exato é mais rápido
-- E mais correto que aproximado.
--
-- ## O índice HNSW fica
--
-- Ele deixa de ser usado por esta RPC, e é de propósito. Não foi apagado porque o custo de escrita
-- na escala atual é irrelevante e reconstruir HNSW numa tabela grande depois é caro. Quando o
-- conjunto ELEGÍVEL (não a tabela) passar de alguns milhares, a saída não é soltar o `order by` de
-- volta: é índice HNSW PARCIAL por escopo, para o filtro entrar antes da caminhada do grafo em vez
-- de depois. Voltar ao pós-filtro traz o bug de volta, e o pgTAP
-- `knowledge_match.test.sql` reprova quem tentar: ele monta 60 chunks fora de escopo mais próximos
-- da consulta que os de dentro, que é exatamente o que o ef_search comia.

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
  ),
  -- `materialized` é a correção: força o filtro de escopo a rodar ANTES da ordenação por
  -- distância. Sem isto o planner usa o HNSW, que escolhe os vizinhos primeiro e deixa o filtro
  -- comer o resultado depois. Ver o cabeçalho desta migration.
  elegiveis as materialized (
    select
      k.source_type, k.source_id, k.chunk_index, k.content, k.scope,
      k.location_id, k.destination_id, k.embedding
    from public.knowledge_chunk k, resolved r
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
  )
  select
    e.source_type, e.source_id, e.chunk_index, e.content, e.scope,
    e.location_id, e.destination_id,
    1 - (e.embedding OPERATOR(extensions.<=>) q.emb) as similarity
  from elegiveis e, q
  order by e.embedding OPERATOR(extensions.<=>) q.emb
  limit greatest(1, least(coalesce(p_k, 6), 20));
$$;

comment on function public.match_knowledge(text, uuid, uuid, integer) is
  'Busca semântica na base de conhecimento, filtrando o escopo do ADR-002 ANTES de ranquear por distância (CTE materialized). Ordenação exata de propósito: pós-filtro sobre HNSW perdia resultado silenciosamente. Ver a migration 20261029110000.';

-- Sem grant novo: a função é substituída, e os privilégios de 20260910000000 seguem valendo
-- (execute para anon/authenticated/service_role; a tabela continua ilegível direto).
