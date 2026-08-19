# Base de conhecimento vetorizada (RAG nativo)

> Épico E3.3 (chatbot/MCP). Tarefa ClickUp `86ajp4560`. Conecta com ADR-002 (FAQ em camadas) e
> ADR-003 (doc-as-you-build).

## Por que existe

O atendimento tem a base de conhecimento no Notion, indexada e vetorizada pelo Dify, com o bot no
N8N. A decisão é trazer a busca semântica para dentro do Hub e cortar a dependência externa: as tools
e o system prompt passam a ser controlados aqui, e a busca roda no Postgres que já é do projeto. Sair
do Dify sem substituto quebra a precisão da busca, então o Hub precisa da sua própria engine antes de
desligar o Dify.

## O que vetoriza (e o que não)

A FAQ em camadas do ADR-002 já é uma base de conhecimento. O dado estruturado da unidade (endereço,
contato, translado em minutos, preço, capacidade) já é servido on-the-fly pelo `get-faq` como
`scope='auto'` (`buildAutoFaq`). Então o RAG vetoriza só a **prosa**, sem recriar um silo paralelo à
FAQ e sem vetorizar dado estruturado:

- `faq.question` + `faq.answer` nas três camadas (`global`, `destination`, `location`);
- `location.directions_text` (markdown "como chegar", pode ser longo, gera vários chunks);
- `location.notice` (aviso crítico de entrada) e `location.reservation_policy`;
- `location_amenity.notes` (keyado por `location_id`, já que `location_amenity` não tem id próprio).

## Arquitetura

```
Conteúdo muda (faq / prosa de location)
  └─ trigger → enfileira resync da FONTE em knowledge_source_queue          [F2]
       └─ pg_cron */2min → net.http_post → Edge knowledge-embed (chave do Vault)   [F2]
            └─ worker: lê a fonte, chunking (TS puro), delete+reinsert por content_hash,
               batchEmbedContents (Gemini text-embedding-004, 768d), grava vetor
Busca:
  tool search_knowledge(query, location_id?, destination_id?, k?)           [F3]
    └─ Edge knowledge-search (tem a GEMINI_API_KEY): embeda a query
         └─ RPC match_knowledge → top-k trechos, filtrados por escopo       [F1]
```

**Decisões:** pgvector nativo (dado + RLS + escopo num lugar só); embedding pelo Gemini
`gemini-embedding-001` com `outputDimensionality: 768` (reusa a `GEMINI_API_KEY` do chat, sem novo
fornecedor; a chave só tem esse modelo, e ele é `embedContent` síncrono, sem batch); índice HNSW cosseno
(build-once, insert incremental, bom recall em base pequena/média); frescor por outbox de fonte
(prosa longa muda o número de chunks, então a unidade de trabalho é a fonte, não o chunk); v1 é vetor
puro, híbrido (vetor + léxico com RRF) fica para a fase 2.

## Segurança (barreira anti-vazamento multi-tenant)

`knowledge_chunk` tem **RLS ligada e zero policies** (molde `checkout_handoff`): o anon nunca faz
`select` direto. Toda leitura pública passa pela RPC `match_knowledge`, que é `security definer` e
aplica o filtro de escopo do ADR-002. O worker e a fila são `service_role`. A `GEMINI_API_KEY` vive só
na Edge; o caminho de leitura anônimo (chat/MCP público) só vê o resultado.

## F1: fundação (implementada)

Migration `supabase/migrations/20260910000000_knowledge_base.sql`:

- `create extension vector` no schema `extensions`.
- Tabela `knowledge_chunk`: `source_type`, `source_id`, `chunk_index`, `scope` (reusa o enum
  `faq_scope`), `location_id`, `destination_id`, `content`, `content_hash` (sha256, idempotência de
  reembedding), `token_estimate`, `embedding vector(768)`, `embedding_stale`, timestamps,
  `unique(source_type, source_id, chunk_index)`. RLS ligada, zero policies.
- Índices: HNSW `vector_cosine_ops`; parcial `(embedding_stale) where embedding_stale` (o worker acha
  o que reembeddar); `(source_type, source_id)`; `(scope, location_id, destination_id)`.
- RPC `match_knowledge(p_query_embedding text, p_location_id, p_destination_id, p_k)`: o embedding
  entra como texto (o array JSON) e é cast para `vector` dentro, o que evita depender do marshaling de
  tipo vetorial do PostgREST. Filtra escopo (global sempre; destination herdado da location via
  `location.destination_id`, igual `get-faq`; location só da unidade), respeita `is_published`/
  `deleted_at` da faq de origem por `EXISTS`, ordena por `<=>` e limita `least(k, 20)`. Só `execute`
  para anon/authenticated/service_role; a tabela não é legível direto.

**Verificação:** a dimensão 768 fica cravada na coluna e no índice HNSW; trocar de modelo de embedding
exige recriar coluna + índice + rebackfill (comentado na migration; `embedding_stale` permite
rebackfill em massa). Teste `supabase/tests/knowledge_match.test.sql` (pgTAP) cobre isolamento de
escopo, herança de destino, exclusão de stale e de faq não publicada, e ordenação. Como o projeto não
sobe Supabase local, a RPC foi validada no banco vivo com embeddings determinísticos (query por
Unidade A retorna só global + a própria unidade + o destino herdado; a unidade vizinha, o chunk stale
e a faq órfã não vazam).

## F2: pipeline de frescor (implementada)

Fila `knowledge_source_queue` (outbox molde `wps_delivery`) com claim atômico (`for update skip
locked`), `enqueue_knowledge_resync` + triggers em `faq`, `location` e `location_amenity`, Edge
`knowledge-embed` (chunking puro, `embedContent` um a um, backoff reusado de `wps-deliver`), cron
padrão B com a chave interna no Vault, e o backfill inicial que enfileira as fontes publicadas para o
worker drenar.

**Auth do worker:** o header `x-knowledge-embed-key` é validado contra o Vault por uma RPC
(`knowledge_embed_key_valid`) que devolve só um booleano. O segredo mora só no Vault (criado
operacionalmente, fora do repo), nunca vira env desta Edge nem trafega para fora do Postgres.

**Estado (implementado e verificado no banco vivo):** as 40 fontes de prosa existentes (38 faq + 1
`directions_text` + 1 `reservation_policy`) foram vetorizadas pelo caminho real do cron
(pg_net → Edge → embedContent → grava). A busca semântica confere: a query "Como cancelo uma reserva?"
retorna ela mesma no topo (similaridade 1.0) e agrupa as FAQs do ciclo de reserva logo abaixo. O
gatilho de frescor confere: editar uma faq enfileira `upsert`, despublicar enfileira `delete`.

## F3: superfície de leitura (implementada)

Edge `knowledge-search` (`verify_jwt=false`, molde `get-faq`): embeda a query com
`gemini-embedding-001` (`taskType: RETRIEVAL_QUERY`, 768d) e chama a RPC `match_knowledge`. A
`GEMINI_API_KEY` mora só nesta Edge; o client anon do chat/MCP não a tem, por isso a tool invoca a
Edge dedicada, igual `get_faq → get-faq`.

Tool `search_knowledge(query, location_id?, destination_id?, k?)` no registro compartilhado
`_shared/assistant-tools.ts` (1 `ReadToolDef` + 1 `case`): aparece no MCP público, no MCP customer e no
chat de uma vez (`READ_TOOLS.map`). Docs do ADR-003 no mesmo PR: cards `server`/`customer` +
`gen:cards` (sha256), `mcp.md` §4, `chatbot.md`. O drift guard cobre a sincronia (65 tools).

**Verificado ponta a ponta pelo MCP público:** `tools/list` lista `search_knowledge`; um
`tools/call` com a pergunta em linguagem natural "posso cancelar minha reserva sem pagar taxa?"
(palavras diferentes da FAQ armazenada) embeda a query e traz a FAQ de cancelamento no topo. Testes:
`mcp.test.ts` (a tool é de leitura em public+customer, nunca partner, chamável sem escopo).

## O filtro roda antes do ranking (correção de 19/08/2026)

A `match_knowledge` ordena o conjunto elegível de forma **exata**, e não pela aproximação do HNSW.
Isso não é detalhe de performance, é o que garante que a resposta exista.

**O que estava errado.** Com o `order by embedding <=> query` livre, o planner usava o índice HNSW,
que é busca aproximada: ele caminha o grafo, colhe os `hnsw.ef_search` vizinhos mais próximos
(default 40) e só então o `where` de escopo roda sobre esses 40. Filtro seletivo derruba candidatos
que o índice já tinha escolhido. O filtro nunca esteve errado; errada estava a ordem.

**Medido em produção, com 409 chunks:**

| Sintoma | Antes | Depois |
|---|---|---|
| `"onde espero a van em Viracopos?"` na Edge publicada | **0 trechos** | 3 trechos |
| k=6 com 8 globais elegíveis, consulta colada nos chunks de destino | **4 linhas** | 6 linhas |
| Pior caso entre os 23 destinos (k=6) | 5 linhas | 6 linhas |

O zero acontecia porque a pergunta é semanticamente colada nos 400 chunks de destino: os 40 vizinhos
eram todos de destino e, sem `destination_id` no pedido, o filtro só admitia os 8 globais. Os 40
candidatos morriam inteiros. A mesma consulta devolvia 4 com o `ef_search` padrão e 6 com
`ef_search=1000`, que é a assinatura de recall perdido por pós-filtro.

**Por que o caso sem contexto é o comum.** `location_id` e `destination_id` são opcionais na tool
`search_knowledge`, e quem pergunta escreve "Viracopos", não um uuid. A primeira chamada de uma
conversa quase sempre vai sem contexto, que é justo o cenário em que 401 dos 409 chunks são
inelegíveis e o pós-filtro é mais destrutivo.

**A correção** é uma CTE `materialized` (barreira de otimização): o conjunto elegível é resolvido
primeiro, pelo btree `knowledge_chunk_scope_idx` que já existia, e a ordenação por distância roda
sobre ele. Recall vira 100% por construção. O custo é uma varredura do conjunto elegível, barato
porque o filtro de escopo é seletivo por natureza: uma pergunta vê no máximo (globais + os chunks de
UM destino + os de UMA unidade), hoje ~25 de 409.

**O índice HNSW ficou, dormente e de propósito.** O custo de escrita nesta escala é irrelevante e
reconstruir HNSW numa tabela grande depois é caro. Quando o conjunto **elegível** (não a tabela)
passar de alguns milhares, a saída não é soltar o `order by` de volta: é índice HNSW **parcial por
escopo**, para o filtro entrar antes da caminhada do grafo em vez de depois.

**O guard.** `knowledge_match.test.sql` monta 60 chunks fora de escopo mais próximos da consulta que
os de dentro (mais que os 40 do `ef_search`) e roda com `enable_seqscan = off`, que é a condição
exata em que o bug aparece. Verificado também no banco vivo, com 60 chunks de similaridade 1.0
inelegíveis inseridos e removidos: 6 de 6 linhas, zero vazamento de escopo.

> **Efeito colateral que vale saber:** o índice HNSW não é parcial, então chunk com
> `embedding_stale = true` continua ocupando vaga entre os candidatos do grafo, mesmo sendo
> descartado pelo filtro. Antes da correção, uma onda de reembedding degradaria a busca enquanto
> durasse. Agora não.

Migration `20261029110000_match_knowledge_filtra_antes_de_ranquear.sql`.

**Verificado no chat do site:** a pergunta "se meu voo atrasar e eu chegar depois do horário, perco a
vaga ou tem tolerância?" faz o modelo escolher `search_knowledge` sozinho (`used_tools` confirma) e
responder ancorado na FAQ vetorizada ("30 minutos antes e 60 depois, sem cobrança").
