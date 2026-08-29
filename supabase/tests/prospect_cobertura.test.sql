-- pgTAP: E0.17-j · ADR-010 · o lote mapeado publicado precisa ser renderizável.
-- Migration: 20261106090000_concorrentes_na_pagina_de_destino.sql
-- Spec: docs/specs/lote-mapeado-vitrine.md (seção "Cobertura: de onde vêm os concorrentes")
--
-- A rodada de 29/08/2026 liberou 24 rascunhos e inseriu 76 lotes do Google Places de uma
-- vez, fechando em 143 publicados. Cada
-- invariante aqui é um jeito de a linha SUMIR da página sem erro nenhum no build:
--
--   1. sem coordenada, a tabela de distância descarta a linha em silêncio
--      (`proximityRanking` filtra `distance_km != null`) e o lote fica invisível;
--   2. sem `public_name`/`public_slug`, o card não tem título nem URL;
--   3. mesmo `google_place_id` de uma unidade parceira significa publicar como concorrente
--      um lote que é nosso. Foi o caso de Airpark, Redpark e Skypark em Lisboa: lá o guarda
--      de slug barrou, mas ele só barra quando o slug bate, e o place_id é a identidade real;
--   4. mesmo nome público no mesmo destino é a versão visível do item 3.
--
-- Não testa "todo destino tem 3 concorrentes" de propósito: Maceió, João Pessoa e Teresina
-- ficam abaixo porque o mercado é esse, e um teste assim reprovaria por um fato do mundo.
--
-- Roda em transação com rollback.

begin;
select plan(4);

select is(
  (select count(*)::int from public.prospect_location
   where is_published and converted_at is null and (latitude is null or longitude is null)),
  0,
  'lote mapeado publicado sempre tem coordenada (senão some da tabela de distância)'
);

select is(
  (select count(*)::int from public.prospect_location
   where is_published and converted_at is null and (public_name is null or public_slug is null)),
  0,
  'lote mapeado publicado sempre tem nome público e slug público'
);

select is(
  (select count(*)::int
   from public.prospect_location p
   join public.location l on l.google_place_id = p.google_place_id and l.deleted_at is null
   where p.is_published and p.converted_at is null),
  0,
  'nenhum lote mapeado publicado compartilha google_place_id com unidade parceira'
);

select is(
  (select count(*)::int
   from public.prospect_location p
   join public.location l
     on l.destination_id = p.destination_id
    and lower(l.public_name) = lower(p.public_name)
    and l.deleted_at is null
   where p.is_published and p.converted_at is null),
  0,
  'nenhum lote mapeado publicado repete o nome público de uma unidade no mesmo destino'
);

select * from finish();
rollback;
