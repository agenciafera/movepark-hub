-- Remove a curadoria e o ranking antigos da vitrine da home, que ficaram sem consumidor.
--
-- Spec: docs/specs/customer/home-and-search.md §6b
--
-- A vitrine passou a ser curada por TIPO DE VAGA em `home_featured_offer` (20261031090000). O que
-- sai aqui são as três gerações anteriores da mesma ideia, que sobreviveram sem ninguém chamar:
--
--   1. `location.is_popular` + `location.popular_sort_order` (20260705000000), curadoria editorial
--      por UNIDADE. Nunca ganharam tela: os quatro valores existentes foram escritos na mão, em
--      SQL, e não surtiam efeito nenhum. A granularidade é a errada, e é o que a tabela nova
--      conserta: o card da home é uma oferta ("Aeropark > Vaga Coberta"), não um estacionamento.
--   2. `popular_locations(integer)` (20260716000001), ranking por unidade.
--   3. `popular_parking_types(integer)` (20260904000000, reescrita em 20261016095500), ranking por
--      tipo de vaga.
--
-- Por que dropar em vez de deixar quieto:
--
--   Coluna que não faz nada mas parece que faz é armadilha. `is_popular` estava `true` em quatro
--   unidades, e a leitura óbvia de quem abrisse a tabela é que aquilo controla a home. Era
--   exatamente essa confusão que motivou a troca: quem quisesse destacar uma unidade mexeria ali e
--   não veria efeito nenhum.
--
--   As duas RPCs são `SECURITY DEFINER` com EXECUTE para `anon`, ou seja, chamáveis por qualquer
--   um com a anon key, que vai embutida no bundle do front. Manter função aberta que ninguém chama
--   é superfície de graça. `popular_parking_types` ainda por cima é a que nunca filtrou status da
--   empresa (dava `join company` só para pegar o slug), e era por ela que a home mostrava unidade
--   de empresa inativa para quem estivesse logado como hub_admin.
--
-- Antes de escrever isto foi varrido: front, Edge Functions, `src/worker.ts`, e2e (Playwright e
-- Windup), scripts, `public/openapi.yaml`, cards MCP e `agent-skills`. No banco vivo, `pg_proc` e
-- `pg_views` também: as únicas funções que citam `popular_sort_order` são as duas que saem aqui, e
-- a única dependência das colunas é o índice abaixo.
--
-- ATENÇÃO a quem for ler o diff: `is_popular` existe em TRÊS tabelas. `destination.is_popular` e
-- `fare.is_popular` estão VIVAS, editadas no form de destino e no editor de tarifas. Só a de
-- `location` sai.

set search_path = public, extensions;

-- As RPCs primeiro: são elas que leem a coluna.
drop function if exists public.popular_parking_types(integer);
drop function if exists public.popular_locations(integer);

-- Índice parcial sobre as duas colunas. Cairia junto com elas, mas explícito documenta melhor.
drop index if exists public.idx_location_popular;

alter table public.location
  drop column if exists is_popular,
  drop column if exists popular_sort_order;
