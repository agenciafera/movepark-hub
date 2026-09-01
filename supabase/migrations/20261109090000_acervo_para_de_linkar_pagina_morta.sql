-- O acervo para de linkar página que não existe mais.
--
-- Varredura de 31/08/2026 sobre TODO link interno de `blog_post.body_md`,
-- `knowledge_chunk.content`, `faq.body_md`, `faq.answer` e `destination.intro`, cruzando
-- cada alvo com o que de fato existe publicado. Resultado: 19 alvos mortos.
--
-- Por que isso não é "só um 301". O corpo do post é renderizado com `<Link>` do React
-- Router (`PostBody.tsx`), não com `<a href>`: clique nele é navegação de cliente, sem
-- requisição HTTP, então o mapa de 301 do Worker NUNCA roda. Quem clica vê "Essa página
-- não existe". No `curl` a mesma URL responde 301 e parece saudável, que foi o que
-- escondeu os 131 links da lista de distância por dois dias.
--
-- Três grupos:
--
--   1. **14 posts canibalizados.** O `BLOG_LEGACY` do worker já sabia o sobrevivente de
--      cada um; aqui o link passa a apontar direto para ele, sem o salto.
--   2. **3 URLs na gramática antiga**, todas de Viracopos, que a migration
--      `20261104090000` não pegou porque ela varreu `/destinos/<slug público>` e estas
--      estavam com o slug LEGADO do destino.
--   3. **1 slug de FAQ errado** (`...-aceitos` em vez de `...-aceitam`).
--
-- A substituição é do ALVO INTEIRO do link markdown (`](x)` e `](x/)`), nunca de
-- substring solta. Isso não é preciosismo: em 30/08 um `replace` de
-- `/estacionamentos/aeroporto-porto` acertou `/estacionamentos/aeroporto-porto-alegre` e
-- produziu `/search?dest=OPO-alegre` em duas FAQ. Corrigido no mesmo dia, e é o motivo da
-- regra.
--
-- O guarda `scripts/check-internal-links.mjs` passou a cobrir todas as famílias de
-- conteúdo, não só `/estacionamentos/**`, e reprova o build se isto voltar.
--
-- Ver docs/specs/url-estacionamentos.md e docs/specs/blog.md.

do $$
declare
  par record;
  de text;
  para text;
begin
  for par in
    select * from (values
      -- 1. posts canibalizados (alvo = o sobrevivente que o worker já apontava)
      ('/blog/5-vantagens-de-estacionar-no-aeroporto-de-curitiba', '/blog/top-3-estacionamentos-do-aeroporto-de-curitiba'),
      ('/blog/aeroporto-afonso-pena-5-melhores-opcoes-de-estacionamento-em-2024', '/blog/top-3-estacionamentos-do-aeroporto-de-curitiba'),
      ('/blog/estacionamento-no-aeroporto-de-afonso-pena-a-melhor-opcao-para-sua-viagem', '/blog/top-3-estacionamentos-do-aeroporto-de-curitiba'),
      ('/blog/facilidade-e-conforto-estacionamento-aeroporto-curitiba-cwb', '/blog/top-3-estacionamentos-do-aeroporto-de-curitiba'),
      ('/blog/quanto-custa-um-estacionamento-do-aeroporto-afonso-pena', '/blog/preco-estacionamento-aeroporto-afonso-pena-curitiba-saiba-tudo-aqui'),
      ('/blog/as-melhores-estrategias-para-economizar-no-estacionamento-do-aeroporto-de-guarulhos', '/blog/como-estacionar-barato-no-aeroporto-de-guarulhos'),
      ('/blog/estacionamento-com-desconto-perto-aeroporto-guarulhos', '/blog/como-estacionar-barato-no-aeroporto-de-guarulhos'),
      ('/blog/como-encontrar-o-melhor-estacionamento-no-aeroporto-de-guarulhos', '/blog/guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024'),
      ('/blog/conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023', '/blog/guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024'),
      ('/blog/qual-o-valor-da-diaria-do-estacionamento-no-aeroporto-guarulhos', '/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui'),
      ('/blog/onde-estacionar-proximo-ao-aeroporto-de-viracopos', '/blog/onde-deixar-o-carro-estacionado-em-viracopos'),
      ('/blog/qual-o-valor-da-diaria-do-estacionamento-no-aeroporto-viracopos-2024', '/blog/estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica'),
      ('/blog/quanto-custa-deixar-o-carro-no-aeroporto-viracopos-por-7-dias', '/blog/estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica'),
      ('/blog/qual-o-melhor-estacionamento-no-aeroporto-lisboa-em-2024', '/blog/descubra-o-melhor-parque-low-cost-junto-ao-aeroporto-de-lisboa'),
      -- 2. gramática antiga que sobrou, com o slug legado do destino
      ('/destinos/aeroporto-de-viracopos', '/estacionamentos/aeroporto-viracopos'),
      ('/precos/aeroporto-de-viracopos', '/estacionamentos/aeroporto-viracopos/precos'),
      ('/estacionamento-mais-barato/aeroporto-de-viracopos', '/estacionamentos/aeroporto-viracopos/mais-barato'),
      -- 3. slug de FAQ errado
      ('/faq/quais-formas-de-pagamento-aceitos', '/faq/quais-formas-de-pagamento-aceitam')
    ) as t(de, para)
  loop
    de := par.de;
    para := par.para;

    update public.blog_post
    set body_md = replace(replace(body_md, '](' || de || '/)', '](' || para || ')'), '](' || de || ')', '](' || para || ')')
    where body_md like '%](' || de || ')%' or body_md like '%](' || de || '/)%';

    update public.knowledge_chunk
    set content = replace(replace(content, '](' || de || '/)', '](' || para || ')'), '](' || de || ')', '](' || para || ')')
    where content like '%](' || de || ')%' or content like '%](' || de || '/)%';

    update public.faq
    set body_md = replace(replace(body_md, '](' || de || '/)', '](' || para || ')'), '](' || de || ')', '](' || para || ')')
    where coalesce(body_md, '') like '%](' || de || ')%' or coalesce(body_md, '') like '%](' || de || '/)%';

    update public.faq
    set answer = replace(replace(answer, '](' || de || '/)', '](' || para || ')'), '](' || de || ')', '](' || para || ')')
    where coalesce(answer, '') like '%](' || de || ')%' or coalesce(answer, '') like '%](' || de || '/)%';

    update public.destination
    set intro = replace(replace(intro, '](' || de || '/)', '](' || para || ')'), '](' || de || ')', '](' || para || ')')
    where coalesce(intro, '') like '%](' || de || ')%' or coalesce(intro, '') like '%](' || de || '/)%';
  end loop;
end $$;
