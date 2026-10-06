-- SEO: Adiciona seção "Posts Relacionados" aos 5 guias-completo canonical
-- Estratégia de linking interno: guia-hub linká para 5-7 posts específicos
-- que detalham ângulos complementares (preço, segurança, economia, operadores)

-- 1. Guarulhos: adiciona 7 posts relacionados
UPDATE public.blog_post
SET body_md = body_md || E'\n\n## 📚 Posts Relacionados sobre Guarulhos\n\nExplore tópicos específicos sobre estacionamento no Aeroporto de Guarulhos:\n\n- [Preço do estacionamento no Aeroporto de Guarulhos em 2026](/blog/preco-estacionamento-aeroporto-guarulhos-saiba-tudo-aqui/)\n- [Como estacionar barato no Aeroporto de Guarulhos em 2026](/blog/como-estacionar-barato-no-aeroporto-de-guarulhos/)\n- [É seguro deixar o carro no aeroporto Guarulhos?](/blog/estacionamento-aeroporto-guarulhos-seguranca-do-seu-veiculo-e-prioridade/)\n- [Estacionamento próximo ao Aeroporto Guarulhos: distância e tempo](/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/)\n- [Estacionamento no Terminal 1 do Aeroporto de Guarulhos](/blog/estacionamento-terminal-1-aeroporto-guarulhos/)\n- [Estacionamento mensal no Aeroporto de Guarulhos](/blog/estacionamento-mensal-no-aeroporto-de-guarulhos/)\n- [Convênios de estacionamento no aeroporto em 2026](/blog/convenio-de-estacionamento-no-aeroporto/)\n\n_Cada post aprofunda um ângulo diferente: tarifa, economia, segurança e operadores específicos._\n',
  updated_at = now()
WHERE slug = 'guia-completo-aeroporto-guarulhos' AND deleted_at IS NULL;

-- 2. Viracopos: adiciona 7 posts relacionados
UPDATE public.blog_post
SET body_md = body_md || E'\n\n## 📚 Posts Relacionados sobre Viracopos\n\nExplore tópicos específicos sobre estacionamento no Aeroporto de Viracopos:\n\n- [Estacionamento Aeroporto Viracopos: tabela de preços de 2026](/blog/estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica/)\n- [Top 5: estacionamento mais barato em Viracopos em 2026](/blog/como-pagar-mais-barato-no-estacionamento-do-aeroporto-viracopos-em-2024/)\n- [Como reservar estacionamento antecipadamente em Viracopos](/blog/estacionamento-aeroporto-viracopos-como-reservar-antecipadamente-e-garantir-sua-vaga/)\n- [Como funciona o estacionamento de Viracopos do portão à saída](/blog/como-funciona-o-estacionamento-do-aeroporto-de-viracopos/)\n- [É seguro deixar o carro em Viracopos?](/blog/e-seguro-deixar-o-carro-no-aeroporto-de-viracopos/)\n- [Estacionamento coberto em Viracopos: quando vale o preço](/blog/estacionamento-coberto-em-viracopos/)\n- [Longa permanência em Viracopos: 15, 30 dias e mensal](/blog/estacionamento-de-longa-permanencia-em-viracopos/)\n\n_Cada post aprofunda um ângulo diferente: tarifa, reserva, operadores específicos e opções de cobertura._\n',
  updated_at = now()
WHERE slug = 'guia-completo-aeroporto-viracopos' AND deleted_at IS NULL;

-- 3. Confins: adiciona 6 posts relacionados
UPDATE public.blog_post
SET body_md = body_md || E'\n\n## 📚 Posts Relacionados sobre Confins\n\nExplore tópicos específicos sobre estacionamento no Aeroporto de Confins:\n\n- [Preço do estacionamento no Aeroporto de Confins em 2026](/blog/preco-do-estacionamento-no-aeroporto-de-confins/)\n- [Top 5 estacionamentos mais baratos em Confins](/blog/estacionamento-mais-barato-no-aeroporto-de-confins/)\n- [É seguro deixar o carro em Confins?](/blog/e-seguro-deixar-o-carro-no-aeroporto-de-confins/)\n- [Estacionamento dentro do Aeroporto de Confins: E3, P1, P3](/blog/estacionamento-dentro-do-aeroporto-de-confins/)\n- [TOP 3 Estacionamentos do Aeroporto de Confins](/blog/top-3-estacionamentos-do-aeroporto-de-confins/)\n- [Estacionamento de moto no Aeroporto de Confins](/blog/estacionamento-de-moto-no-aeroporto-de-confins/)\n\n_Cada post aprofunda um ângulo diferente: tarifa, economia, segurança e tipos de veículos._\n',
  updated_at = now()
WHERE slug = 'guia-completo-aeroporto-confins' AND deleted_at IS NULL;

-- 4. Curitiba (Afonso Pena): adiciona 5 posts relacionados
UPDATE public.blog_post
SET body_md = body_md || E'\n\n## 📚 Posts Relacionados sobre Curitiba\n\nExplore tópicos específicos sobre estacionamento no Aeroporto de Curitiba:\n\n- [Preço do estacionamento no Aeroporto Afonso Pena em 2026](/blog/preco-estacionamento-aeroporto-afonso-pena-curitiba-saiba-tudo-aqui/)\n- [Top 5 estacionamentos mais baratos do Aeroporto de Curitiba](/blog/estacionamento-barato-aeroporto-curitiba/)\n- [É seguro deixar o carro no Aeroporto Afonso Pena?](/blog/e-seguro-deixar-o-carro-no-aeroporto-afonso-pena/)\n- [O estacionamento mais próximo do Aeroporto Afonso Pena](/blog/conheca-o-estacionamento-mais-proximo-do-aeroporto-afonso-pena-em-2024/)\n- [TOP 3 estacionamentos do Aeroporto de Curitiba](/blog/top-3-estacionamentos-do-aeroporto-de-curitiba/)\n\n_Cada post aprofunda um ângulo diferente: tarifa, economia, segurança e proximidade._\n',
  updated_at = now()
WHERE slug = 'guia-completo-aeroporto-curitiba' AND deleted_at IS NULL;

-- 5. Porto Alegre (Salgado Filho): adiciona 1 post (poucos posts neste destino)
UPDATE public.blog_post
SET body_md = body_md || E'\n\n## 📚 Posts Relacionados sobre Porto Alegre\n\nExplore tópicos específicos sobre estacionamento no Aeroporto Salgado Filho:\n\n- [Top 5 estacionamentos baratos no Aeroporto de Porto Alegre](/blog/top-5-estacionamentos-baratos-aeroporto-porto-alegre/)\n\n_Mais posts em breve. Acompanhe nosso blog para dicas de economia, segurança e operadores específicos._\n',
  updated_at = now()
WHERE slug = 'guia-completo-aeroporto-porto-alegre' AND deleted_at IS NULL;

-- Validação: verificar que os updates foram aplicados
SELECT
  slug,
  title,
  CASE WHEN body_md ILIKE '%Posts Relacionados%' THEN 'COM linking interno' ELSE 'SEM linking' END as status,
  LENGTH(body_md) as novo_tamanho
FROM public.blog_post
WHERE slug IN (
  'guia-completo-aeroporto-guarulhos',
  'guia-completo-aeroporto-viracopos',
  'guia-completo-aeroporto-confins',
  'guia-completo-aeroporto-curitiba',
  'guia-completo-aeroporto-porto-alegre'
)
AND deleted_at IS NULL
ORDER BY slug;
