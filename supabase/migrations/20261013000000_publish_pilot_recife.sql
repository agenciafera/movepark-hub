-- E0.17-d · publica o piloto, agora que existe seção onde ele aparece.
--
-- A ficha nasceu rascunho em `20261010000000` de propósito: publicar antes de a página de
-- destino ter a seção "Outros estacionamentos na região" seria publicar para ninguém.
--
-- O gate de publicação da E0.17-h é ter endereço, e este tem: ficha sem endereço na
-- página de destino é thin content e queima a credibilidade da seção inteira. Resolvido
-- na Places API, não chutado.
--
-- Daqui em diante isto é um toggle na linha da lista do painel (E0.17-h), não migration.
-- Esta existe porque o painel ainda não existe, e SQL na mão não deixa rastro.

update public.prospect_location
set is_published = true
where slug = 'talentos-park-aeroporto-recife'
  and address is not null
  and converted_at is null;
