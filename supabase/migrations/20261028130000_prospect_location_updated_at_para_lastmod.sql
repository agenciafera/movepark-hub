-- Libera `prospect_location.updated_at` para leitura pública, e só ela.
--
-- A tabela usa GRANT por coluna (ADR-010, Q-021): o `anon` enxerga 14 colunas e o telefone
-- do lote fica de fora, porque o corte por coluna é o que impede o contato de vazar mesmo
-- para o admin que lê por PostgREST. `updated_at` não estava na lista.
--
-- Isso apareceu quando o sitemap passou a levar `lastmod` real: a consulta do build pedia
-- `updated_at` e o PostgREST devolvia "permission denied for table prospect_location", com
-- `data` nulo. As 43 fichas sumiam do sitemap inteiro, e o guarda do split derrubou o build
-- em vez de publicar um índice sem a seção. Sem esta permissão, `/estacionamentos/*` ficaria
-- com a data do build, que muda a cada deploy mesmo sem a ficha ter mudado.
--
-- `updated_at` é timestamp de linha, sem dado pessoal. O telefone e as demais colunas fora
-- da allowlist continuam exatamente como estavam: este GRANT é nominal por coluna e não
-- toca em nenhuma outra.

grant select (updated_at) on public.prospect_location to anon, authenticated;
