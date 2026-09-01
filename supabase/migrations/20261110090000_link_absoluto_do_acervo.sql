-- O acervo para de citar host e gramática antigos em link ABSOLUTO.
--
-- A varredura de 31/08 olhou só link relativo (`](/...)`), e por isso não viu nada disto.
-- Link absoluto (`https://movepark.co/destinos/...`, `https://hub.movepark.co/...`) passou
-- inteiro pela peneira. É o formato que mais aparece no gêmeo Markdown, que é justamente o
-- que agente de IA lê.
--
-- O que estava no ar:
--   · 1 post publicado com `hub.movepark.co` e `/destinos/<slug legado>` no corpo. O arquivo
--     `public/blog/<slug>.md` dele tinha sido corrigido à mão em 30/08 e o `body_md` não:
--     a página renderizava do banco, então o gêmeo dizia uma coisa e a página dizia outra, e
--     o teste de contrato lia o ARQUIVO, então ficou verde o tempo todo.
--   · 7 trechos da base de conhecimento (o que o chatbot cita) com o host antigo.
--   · 6 desses trechos com `/destinos/<slug legado>` absoluto.
--
-- A troca de destino é dirigida pela tabela `destination`, do slug mais LONGO para o mais
-- curto: slug é único mas um pode ser prefixo de outro, e substituir na ordem errada produz
-- exatamente o `/search?dest=OPO-alegre` que eu criei em 30/08 com um `replace` solto.

-- 1. Host antigo, em qualquer texto público.
update public.blog_post set body_md = replace(body_md, 'https://hub.movepark.co', 'https://movepark.co')
where body_md like '%hub.movepark.co%';

update public.knowledge_chunk set content = replace(content, 'https://hub.movepark.co', 'https://movepark.co')
where content like '%hub.movepark.co%';

update public.faq set body_md = replace(body_md, 'https://hub.movepark.co', 'https://movepark.co')
where coalesce(body_md, '') like '%hub.movepark.co%';

update public.faq set answer = replace(answer, 'https://hub.movepark.co', 'https://movepark.co')
where coalesce(answer, '') like '%hub.movepark.co%';

update public.destination set intro = replace(intro, 'https://hub.movepark.co', 'https://movepark.co')
where coalesce(intro, '') like '%hub.movepark.co%';

-- 2. `/destinos/<slug legado>` absoluto e relativo, um destino de cada vez, do slug mais
--    longo para o mais curto.
do $$
declare
  d record;
begin
  for d in
    select slug, public_slug from public.destination
    where public_slug is not null and public_slug <> slug
    order by length(slug) desc
  loop
    update public.blog_post
    set body_md = replace(body_md, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug)
    where body_md like '%/destinos/' || d.slug || '%';

    update public.knowledge_chunk
    set content = replace(content, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug)
    where content like '%/destinos/' || d.slug || '%';

    update public.faq
    set body_md = replace(body_md, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug)
    where coalesce(body_md, '') like '%/destinos/' || d.slug || '%';

    update public.faq
    set answer = replace(answer, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug)
    where coalesce(answer, '') like '%/destinos/' || d.slug || '%';

    update public.destination
    set intro = replace(intro, '/destinos/' || d.slug, '/estacionamentos/' || d.public_slug)
    where coalesce(intro, '') like '%/destinos/' || d.slug || '%';
  end loop;
end $$;

-- 3. Portugal não tem página de destino (`is_published = false`), então o alvo da troca
--    acima não existiria. Mesmo tratamento da migration 20261108090000: vai para a busca.
update public.blog_post
set body_md = replace(
      replace(body_md, 'https://movepark.co/estacionamentos/aeroporto-lisboa', 'https://movepark.co/search?dest=LIS'),
      'https://movepark.co/estacionamentos/aeroporto-faro', 'https://movepark.co/search?dest=FAO')
where body_md like '%movepark.co/estacionamentos/aeroporto-lisboa%'
   or body_md like '%movepark.co/estacionamentos/aeroporto-faro%';

update public.knowledge_chunk
set content = replace(
      replace(content, 'https://movepark.co/estacionamentos/aeroporto-lisboa', 'https://movepark.co/search?dest=LIS'),
      'https://movepark.co/estacionamentos/aeroporto-faro', 'https://movepark.co/search?dest=FAO')
where content like '%movepark.co/estacionamentos/aeroporto-lisboa%'
   or content like '%movepark.co/estacionamentos/aeroporto-faro%';
