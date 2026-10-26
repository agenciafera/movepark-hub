-- Conteúdo 65: os mesmos dois links de saída mortos da migration 20261201000000, nas versões em
-- inglês e espanhol dos posts (`blog_post_i18n`), que têm corpo próprio. A auditoria rodada depois
-- do deploy de 26/10/2026 ainda os achou por lá.
--
-- 1. `e-seguro-deixar-o-carro-no-aeroporto-afonso-pena`: Sesp-PR `/Pagina/Estatisticas-2` (404)
--    vira `/CAPE/Estatisticas`, sem prometer recorte por município.
-- 2. `tudo-sobre-o-aeroporto-de-confins-guia-completo`: página de ônibus do site antigo do BH Airport
--    (404) vira a "Como chegar" do site novo.
--
-- O link da Sejusp-MG fica, como no português: o site inteiro respondia 503.
-- Cada `replace` só age se o trecho antigo ainda estiver lá, então reaplicar não muda nada.

update public.blog_post_i18n i
   set body_md = replace(i.body_md,
     $a$publishes [crime statistics by municipality](https://www.seguranca.pr.gov.br/Pagina/Estatisticas-2), updated periodically.$a$,
     $b$publishes [the crime statistics report for each year](https://www.seguranca.pr.gov.br/CAPE/Estatisticas).$b$)
  from public.blog_post p
 where p.id = i.blog_post_id
   and p.slug = 'e-seguro-deixar-o-carro-no-aeroporto-afonso-pena'
   and i.locale = 'en'
   and i.body_md like '%seguranca.pr.gov.br/Pagina/Estatisticas-2%';

update public.blog_post_i18n i
   set body_md = replace(i.body_md,
     $a$publica [las estadísticas criminales por municipio](https://www.seguranca.pr.gov.br/Pagina/Estatisticas-2), con actualización periódica.$a$,
     $b$publica [el informe estadístico criminal de cada año](https://www.seguranca.pr.gov.br/CAPE/Estatisticas).$b$)
  from public.blog_post p
 where p.id = i.blog_post_id
   and p.slug = 'e-seguro-deixar-o-carro-no-aeroporto-afonso-pena'
   and i.locale = 'es'
   and i.body_md like '%seguranca.pr.gov.br/Pagina/Estatisticas-2%';

update public.blog_post_i18n i
   set body_md = replace(i.body_md,
     $a$[**Conexão Aeroporto**](https://www.bh-airport.com.br/SitePages/pt/localizacao/onibus.aspx): details of the express bus service available to passengers.$a$,
     $b$[**Getting there by bus**](https://www.bh-airport.com.br/pt-BR/how-to-get-there): the lines that serve the airport, on BH Airport's official page.$b$)
  from public.blog_post p
 where p.id = i.blog_post_id
   and p.slug = 'tudo-sobre-o-aeroporto-de-confins-guia-completo'
   and i.locale = 'en'
   and i.body_md like '%bh-airport.com.br/SitePages/pt/localizacao/onibus.aspx%';

update public.blog_post_i18n i
   set body_md = replace(i.body_md,
     $a$[**Conexão Aeroporto**](https://www.bh-airport.com.br/SitePages/pt/localizacao/onibus.aspx): detalles sobre el servicio de colectivo ejecutivo disponible para pasajeros.$a$,
     $b$[**Cómo llegar en colectivo**](https://www.bh-airport.com.br/pt-BR/how-to-get-there): las líneas que llegan al aeropuerto, en la página oficial de BH Airport.$b$)
  from public.blog_post p
 where p.id = i.blog_post_id
   and p.slug = 'tudo-sobre-o-aeroporto-de-confins-guia-completo'
   and i.locale = 'es'
   and i.body_md like '%bh-airport.com.br/SitePages/pt/localizacao/onibus.aspx%';
