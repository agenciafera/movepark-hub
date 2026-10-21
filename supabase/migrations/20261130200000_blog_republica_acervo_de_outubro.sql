-- Republica o acervo do blog despublicado sem registro entre 06/10 e 09/10/2026.
--
-- O que aconteceu: o manifesto de slugs publicados (`public/blog-slugs.json`, gerado no build a
-- partir do banco) tinha 114 posts em 06/10 (commit 3e5d6c71) e 30 às 13:11 de 09/10 (commit
-- 6140836c). Às 13:42:02 de 09/10 uma única operação tocou todas as linhas de `blog_post`. Nenhuma
-- migration, commit, spec ou atividade registra a despublicação, e os posts responderam 404 (e não
-- 301) por 12 dias, entre eles as quatro donas de Confins e a dona de melhor de Viracopos.
--
-- O que volta: os posts que estavam no manifesto de 06/10 e saíram, mais `bepark-confins`,
-- publicado em 07/10 (Conteúdo 47). Ficam de fora:
--   - os 26 guias automáticos `guia-completo-aeroporto-*` (e os de centro, terminal, Jardim
--     Paulista e Salgado Filho), que o Léo vem substituindo pelo guia "padrão Viracopos";
--   - os perdedores da consolidação (`BLOG_CONSOLIDATED_SLUGS` em src/worker.ts), que seguem em 301.
-- Nenhum dos 60 está no mapa de consolidação, conferido na escrita.
--
-- As traduções (`blog_post_i18n`) não caíram: seguem com `is_published = true` e voltam junto com
-- o post em português. O trigger de `blog_post` enfileira o rebuild do site.
--
-- Idempotente: só toca linha despublicada e viva.

update public.blog_post p
   set is_published = true
  from (values
  ('bandeira-park-viracopos'),
  ('bepark-confins'),
  ('como-funciona-o-estacionamento-do-aeroporto-de-viracopos'),
  ('como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024'),
  ('convenio-de-estacionamento-no-aeroporto'),
  ('deixar-o-carro-no-aeroporto-do-recife'),
  ('e-seguro-deixar-o-carro-no-aeroporto-de-confins'),
  ('e-seguro-deixar-o-carro-no-aeroporto-de-viracopos'),
  ('estacionamento-aeroporto-viracopos-como-reservar-antecipadamente-e-garantir-sua-vaga'),
  ('estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica'),
  ('estacionamento-coberto-em-viracopos'),
  ('estacionamento-de-longa-permanencia-em-viracopos'),
  ('estacionamento-de-moto-no-aeroporto-de-confins'),
  ('estacionamento-dentro-do-aeroporto-de-confins'),
  ('estacionamento-dentro-do-aeroporto-de-viracopos'),
  ('estacionamento-gratuito-no-aeroporto-de-viracopos'),
  ('estacionamento-mais-barato-no-aeroporto-de-confins'),
  ('estacionamento-mensal-no-aeroporto-de-guarulhos'),
  ('estacionamento-no-aeroporto-de-campo-grande-guia-completo'),
  ('estacionamento-no-aeroporto-de-cuiaba-guia-completo'),
  ('estacionamento-no-aeroporto-de-goiania-guia-completo'),
  ('estacionamento-no-aeroporto-de-londrina-guia-completo'),
  ('estacionamento-no-aeroporto-santos-dumont-guia-completo'),
  ('estacionamento-perto-do-aeroporto-de-navegantes-guia-de-distancia-e-traslado'),
  ('estacionamento-viracopos-azul'),
  ('garageinn-viracopos'),
  ('guia-completo-descubra-o-melhor-do-aeroporto-viracopos'),
  ('guia-completo-dos-estacionamentos-proximos-ao-aeoroporto-de-confins'),
  ('guia-completo-dos-estacionamentos-proximos-ao-aeroporto-de-congonhas'),
  ('guia-completo-dos-estacionamentos-proximos-ao-aeroporto-de-lisboa-precos-e-opcoes'),
  ('guia-completo-sobre-o-aeroporto-de-guarulhos'),
  ('guia-completo-tudo-o-que-voce-deveria-saber-sobre-o-aeroporto-de-lisboa'),
  ('km64-viracopos'),
  ('melhores-precos-de-estacionamento-no-aeroporto-de-navegantes'),
  ('onde-deixar-o-carro-estacionado-em-viracopos'),
  ('preco-do-estacionamento-no-aeroporto-de-confins'),
  ('quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024'),
  ('quanto-custa-deixar-o-carro-no-aeroporto'),
  ('quanto-custa-estapar-viracopos'),
  ('top-3-estacionamentos-do-aeroporto-de-confins'),
  ('top-3-estacionamentos-do-aeroporto-de-navegantes'),
  ('top-5-estacionamentos-baratos-aeroporto-brasilia'),
  ('top-5-estacionamentos-baratos-aeroporto-campo-grande'),
  ('top-5-estacionamentos-baratos-aeroporto-cuiaba'),
  ('top-5-estacionamentos-baratos-aeroporto-florianopolis'),
  ('top-5-estacionamentos-baratos-aeroporto-fortaleza'),
  ('top-5-estacionamentos-baratos-aeroporto-galeao'),
  ('top-5-estacionamentos-baratos-aeroporto-goiania'),
  ('top-5-estacionamentos-baratos-aeroporto-joao-pessoa'),
  ('top-5-estacionamentos-baratos-aeroporto-londrina'),
  ('top-5-estacionamentos-baratos-aeroporto-maceio'),
  ('top-5-estacionamentos-baratos-aeroporto-porto-alegre'),
  ('top-5-estacionamentos-baratos-aeroporto-recife'),
  ('top-5-estacionamentos-baratos-aeroporto-salvador'),
  ('top-5-estacionamentos-baratos-aeroporto-santos-dumont'),
  ('top-5-estacionamentos-baratos-aeroporto-teresina'),
  ('top-5-estacionamentos-baratos-aeroporto-vitoria'),
  ('viracopos-aeroparking'),
  ('virapark-viracopos'),
  ('yellow-parking-viracopos')
  ) as v(slug)
 where p.slug = v.slug
   and p.deleted_at is null
   and p.is_published = false;
