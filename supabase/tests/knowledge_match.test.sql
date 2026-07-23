-- pgTAP: busca semântica da base de conhecimento (E3.3, RAG nativo).
-- Cobre a RPC match_knowledge: filtro de escopo do ADR-002 (global sempre; destination herdado da
-- location; location só da unidade), exclusão de chunk stale e de faq nao publicada/inexistente, e
-- ordenacao por similaridade + teto de k. Embeddings determinísticos (vetor com 1.0 numa dimensão e
-- 0.01 no resto) tornam a asserção estável. Roda em transação com rollback.

begin;
select plan(9);

-- helper: vetor 768d com 1.0 na posicao p_dim e 0.01 no resto (determinístico)
create or replace function pg_temp.vec(p_dim int) returns text language sql as $$
  select '[' || array_to_string(
    array(select case when g = p_dim then 1.0 else 0.01 end from generate_series(1,768) g), ',') || ']';
$$;

-- ── fixtures (como postgres; RLS nao se aplica) ──────────────────────────────
do $$
declare
  did  uuid := gen_random_uuid();
  loca uuid := gen_random_uuid();
  locb uuid := gen_random_uuid();
  cid  uuid := gen_random_uuid();
  fpub uuid := gen_random_uuid();  -- faq publicada (fonte valida)
begin
  insert into public.destination(id, code, name, slug, type, city, country, latitude, longitude, is_published)
  values (did, 'KMT', 'Destino KB Teste', 'destino-kb-teste', 'airport', 'Cidade', 'BR', -23.0, -46.0, true);

  insert into public.company(id, name, slug, status)
  values (cid, 'Empresa KB', 'empresa-kb-teste', 'active');

  insert into public.location(id, company_id, destination_id, name, slug, status)
  values (loca, cid, did, 'Unidade A', 'unidade-a-kb', 'active'),
         (locb, cid, did, 'Unidade B', 'unidade-b-kb', 'active');

  insert into public.faq(id, scope, destination_id, question, answer, is_published)
  values (fpub, 'destination', did, 'Pergunta destino KB?', 'Resposta destino.', true);

  -- chunks: todos com veca (dim 1), menos GLOBALFAR (vecb, dim 2) para testar ordenacao.
  insert into public.knowledge_chunk
    (source_type, source_id, chunk_index, scope, location_id, destination_id, content, content_hash, embedding, embedding_stale)
  values
    ('faq', fpub, 0, 'global', null, null, 'GLOBAL', 'k1', pg_temp.vec(1)::extensions.vector(768), false),
    ('location_directions', loca, 0, 'location', loca, null, 'LOCA', 'k2', pg_temp.vec(1)::extensions.vector(768), false),
    ('location_directions', locb, 0, 'location', locb, null, 'LOCB', 'k3', pg_temp.vec(1)::extensions.vector(768), false),
    ('faq', fpub, 1, 'destination', null, did, 'DESTD', 'k4', pg_temp.vec(1)::extensions.vector(768), false),
    ('location_directions', loca, 1, 'location', loca, null, 'STALE', 'k5', pg_temp.vec(1)::extensions.vector(768), true),
    ('faq', gen_random_uuid(), 0, 'global', null, null, 'ORPHAN', 'k6', pg_temp.vec(1)::extensions.vector(768), false),
    ('faq', fpub, 2, 'global', null, null, 'GLOBALFAR', 'k7', pg_temp.vec(2)::extensions.vector(768), false);

  perform set_config('test.loca', loca::text, false);
  perform set_config('test.locb', locb::text, false);
  perform set_config('test.did',  did::text,  false);
end $$;

-- ── schema ───────────────────────────────────────────────────────────────────
select has_table('public', 'knowledge_chunk', 'tabela knowledge_chunk existe');
select has_function('public', 'match_knowledge', 'RPC match_knowledge existe');

-- ── escopo: query como Unidade A ────────────────────────────────────────────
-- Espera GLOBAL, LOCA, DESTD (herdado), GLOBALFAR. NAO: LOCB, STALE, ORPHAN.
select set_eq(
  format($$ select content from public.match_knowledge(pg_temp.vec(1), %L, null, 20) $$, current_setting('test.loca')),
  $$ values ('GLOBAL'),('LOCA'),('DESTD'),('GLOBALFAR') $$,
  'escopo Unidade A: global + location A + destination herdado + global far'
);

-- isolamento: a direcao da Unidade B nunca aparece para a Unidade A
select is_empty(
  format($$ select content from public.match_knowledge(pg_temp.vec(1), %L, null, 20) where content = 'LOCB' $$, current_setting('test.loca')),
  'location de outra unidade nao vaza'
);

-- stale excluido
select is_empty(
  format($$ select content from public.match_knowledge(pg_temp.vec(1), %L, null, 20) where content = 'STALE' $$, current_setting('test.loca')),
  'chunk stale nao aparece'
);

-- faq inexistente/nao publicada excluida (EXISTS)
select is_empty(
  format($$ select content from public.match_knowledge(pg_temp.vec(1), %L, null, 20) where content = 'ORPHAN' $$, current_setting('test.loca')),
  'chunk de faq inexistente nao aparece'
);

-- ── ordenacao: veca antes de vecb ───────────────────────────────────────────
select is(
  (select content from public.match_knowledge(pg_temp.vec(1), current_setting('test.loca'), null, 20) order by similarity desc limit 1),
  'LOCA'::text,
  'ordena por similaridade (o mais proximo primeiro nao e o GLOBALFAR)'
);
select ok(
  (select similarity from public.match_knowledge(pg_temp.vec(1), current_setting('test.loca'), null, 20) where content = 'GLOBALFAR')
  < (select similarity from public.match_knowledge(pg_temp.vec(1), current_setting('test.loca'), null, 20) where content = 'GLOBAL'),
  'GLOBALFAR (vetor diferente) tem similaridade menor que GLOBAL'
);

-- ── sem location: so global ─────────────────────────────────────────────────
select set_eq(
  $$ select content from public.match_knowledge(pg_temp.vec(1), null, null, 20) $$,
  $$ values ('GLOBAL'),('GLOBALFAR') $$,
  'sem location/destination: apenas escopo global'
);

select finish();
rollback;
