-- Portugal: link de conteúdo para uma página de destino que não existe.
--
-- Lisboa, Porto e Faro têm parceiro no ar, mas o `destination` dos três está
-- `is_published = false`. O SSG não gera `/estacionamentos/aeroporto-lisboa`, e 8 posts,
-- 5 trechos da base de conhecimento e 2 FAQ apontavam para lá. Não é um 301 do Worker
-- resolvendo: a página não existe em endereço nenhum.
--
-- Achado pelo guarda novo `scripts/check-internal-links.mjs`, que cruza todo `href` de
-- `/estacionamentos/**` no dist com o `paths-manifest.json`.
--
-- Para onde vai: `/search?dest=<código>`, que é a mesma rota que o CTA da página de destino
-- usa e a única que responde por Portugal hoje. É rota de app, sem HTML pré-renderizado, e
-- por isso fica fora do guarda. Quando as três praças ganharem página, este link volta a
-- ser `/estacionamentos/<slug>` numa migration de uma linha.
--
-- Ver docs/specs/url-estacionamentos.md.

update public.blog_post
set body_md = replace(
      replace(
        replace(body_md, '/estacionamentos/aeroporto-lisboa', '/search?dest=LIS'),
        '/estacionamentos/aeroporto-porto', '/search?dest=OPO'),
      '/estacionamentos/aeroporto-faro', '/search?dest=FAO')
where body_md like '%/estacionamentos/aeroporto-lisboa%'
   or body_md like '%/estacionamentos/aeroporto-porto%'
   or body_md like '%/estacionamentos/aeroporto-faro%';

update public.knowledge_chunk
set content = replace(
      replace(
        replace(content, '/estacionamentos/aeroporto-lisboa', '/search?dest=LIS'),
        '/estacionamentos/aeroporto-porto', '/search?dest=OPO'),
      '/estacionamentos/aeroporto-faro', '/search?dest=FAO')
where content like '%/estacionamentos/aeroporto-lisboa%'
   or content like '%/estacionamentos/aeroporto-porto%'
   or content like '%/estacionamentos/aeroporto-faro%';

update public.faq
set body_md = replace(
      replace(
        replace(coalesce(body_md, ''), '/estacionamentos/aeroporto-lisboa', '/search?dest=LIS'),
        '/estacionamentos/aeroporto-porto', '/search?dest=OPO'),
      '/estacionamentos/aeroporto-faro', '/search?dest=FAO')
where coalesce(body_md, '') like '%/estacionamentos/aeroporto-lisboa%'
   or coalesce(body_md, '') like '%/estacionamentos/aeroporto-porto%'
   or coalesce(body_md, '') like '%/estacionamentos/aeroporto-faro%';

update public.faq
set answer = replace(
      replace(
        replace(coalesce(answer, ''), '/estacionamentos/aeroporto-lisboa', '/search?dest=LIS'),
        '/estacionamentos/aeroporto-porto', '/search?dest=OPO'),
      '/estacionamentos/aeroporto-faro', '/search?dest=FAO')
where coalesce(answer, '') like '%/estacionamentos/aeroporto-lisboa%'
   or coalesce(answer, '') like '%/estacionamentos/aeroporto-porto%'
   or coalesce(answer, '') like '%/estacionamentos/aeroporto-faro%';
