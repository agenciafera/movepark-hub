-- Conteúdo 65: H1 do guia comparativo de Guarulhos sem o ano vencido.
--
-- O post é a dona de "melhor, comparativo" em GRU (docs/specs/canonicalizacao-gru-cwb.md) e uma das
-- 7 páginas do On Page SEO Checker do Semrush. Em 26/10/2026 era o único post publicado com ano
-- passado no título: o H1 dizia "Guia Atualizado: (...) em 2024", enquanto a description já falava
-- em outubro de 2026. O `meta_title` não tem ano e não muda, e o slug fica como está, porque é
-- contrato de URL (alvo de 9 redirects).
--
-- Só age se o título antigo ainda estiver lá, então reaplicar não muda nada.

update public.blog_post
   set title = 'As 5 melhores opções de estacionamento no Aeroporto Guarulhos em 2026'
 where slug = 'guia-atualizado-5-melhores-opcoes-de-estacionamento-no-aeroporto-guarulhos-em-2024'
   and title = 'Guia Atualizado: 5 melhores opções de estacionamento no Aeroporto Guarulhos em 2024'
   and deleted_at is null;
