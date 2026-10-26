-- Conteúdo 65: links de saída mortos achados pela auditoria do site de 26/10/2026
-- (`bun run seo:auditoria`, docs/specs/plano-autoridade-backlinks.md §5.5).
--
-- 1. `e-seguro-deixar-o-carro-no-aeroporto-afonso-pena` apontava para
--    `seguranca.pr.gov.br/Pagina/Estatisticas-2`, que responde 404. A página de estatística da
--    Secretaria da Segurança Pública do Paraná hoje é `/CAPE/Estatisticas`, com o relatório
--    estatístico criminal de cada ano. O texto deixa de prometer recorte por município, que a
--    página nova não mostra direto.
-- 2. `tudo-sobre-o-aeroporto-de-confins-guia-completo` apontava para a página de ônibus do site
--    antigo do BH Airport (`/SitePages/pt/localizacao/onibus.aspx`, 404). O site novo tem a página
--    "Como chegar", com uma aba de ônibus.
--
-- Fica de fora o link de dados abertos da Sejusp-MG (`e-seguro-deixar-o-carro-no-aeroporto-de-confins`):
-- em 26/10/2026 o `seguranca.mg.gov.br` inteiro respondia 503, inclusive a home. É queda do site,
-- não endereço morto, e a auditoria da segunda seguinte reconfere.
--
-- Cada `replace` só age se o trecho antigo ainda estiver lá, então reaplicar não muda nada.

update public.blog_post
   set body_md = replace(body_md,
     $a$a Secretaria da Segurança Pública do Paraná publica [as estatísticas criminais por município](https://www.seguranca.pr.gov.br/Pagina/Estatisticas-2), com atualização periódica.$a$,
     $b$a Secretaria da Segurança Pública do Paraná publica [o relatório estatístico criminal de cada ano](https://www.seguranca.pr.gov.br/CAPE/Estatisticas).$b$)
 where slug = 'e-seguro-deixar-o-carro-no-aeroporto-afonso-pena'
   and deleted_at is null
   and body_md like '%seguranca.pr.gov.br/Pagina/Estatisticas-2%';

update public.blog_post
   set body_md = replace(body_md,
     $a$[**Conexão Aeroporto**](https://www.bh-airport.com.br/SitePages/pt/localizacao/onibus.aspx): Detalhes sobre o serviço de ônibus executivo disponível para passageiros.$a$,
     $b$[**Como chegar de ônibus**](https://www.bh-airport.com.br/pt-BR/how-to-get-there): as linhas que atendem o aeroporto, na página oficial do BH Airport.$b$)
 where slug = 'tudo-sobre-o-aeroporto-de-confins-guia-completo'
   and deleted_at is null
   and body_md like '%bh-airport.com.br/SitePages/pt/localizacao/onibus.aspx%';
