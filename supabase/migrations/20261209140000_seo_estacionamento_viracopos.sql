-- "estacionamento viracopos" (9.900 buscas/mês, 4.076 impressões em 28 dias no GSC) passa a ter
-- dona: a praça /estacionamentos/aeroporto-viracopos.
--
-- Em 23/11/2026 quem respondia ao termo na posição 7,8 era a ficha do Virapark; a praça estava em
-- 18,8. A forma exata "estacionamento viracopos" não aparecia nenhuma vez no HTML da praça, e a
-- ficha do parceiro não devolve link para ela (é sem saída desde 17/11, pedido da Pare Seguro).
-- Esta migration põe o termo exato onde ele pesa, sem mexer na ficha:
--
--   1. destination.meta_title: "Estacionamento Viracopos: preços no aeroporto (VCP) | Movepark"
--      (62 caracteres, o teto do TITLE_MAX). O H1 segue "Estacionamento Aeroporto Viracopos,
--      Campinas", que cobre a variante "estacionamento aeroporto viracopos" (3.108 impressões).
--   2. destination.meta_description: a abertura autoral começa pelo termo exato. Preço e CTA
--      continuam vindo do código (destinationMetaDescription).
--   3. destination.intro: a primeira frase começa pelo termo exato.
--   4. Dois posts ganham âncora "estacionamento Viracopos" apontando para a praça: a dona de preço
--      troca duas âncoras genéricas ("Aeroporto de Viracopos na Movepark") e o guia do aeroporto,
--      que não linkava a praça, ganha o link na seção de estacionamentos.
--
-- Cada campo só muda se o md5 ainda for o do texto lido em 27/11/2026; os posts têm ainda o md5
-- do resultado conferido, para a troca não sair diferente do que foi revisado. Se alguém editou
-- no meio, a migration aborta inteira. Ver docs/specs/rotina-semanal-busca-e-ia.md.

do $vcp$
declare
  n int;
begin
  -- Guarda de replay: num banco sem o acervo (db reset do CI) não há texto a revisar.
  if not exists (select 1 from public.destination where id = 'da58673f-5dfd-4130-999b-5c987f353330') then
    raise notice 'seo viracopos: banco sem o acervo de 27/11, nada a revisar';
    return;
  end if;

  -- 1 a 3: a praça
  update public.destination
     set meta_title = 'Estacionamento Viracopos: preços no aeroporto (VCP) | Movepark',
         meta_description = 'Estacionamento Viracopos com traslado até o terminal, perto do aeroporto de Campinas (VCP)',
         intro = replace(
           intro,
           'Estacionamento no Aeroporto Viracopos: esta página compara as opções perto do VCP por preço da diária, distância até o terminal e tipo de vaga.',
           'Estacionamento Viracopos: esta página compara as opções perto do aeroporto (VCP) por preço da diária, distância até o terminal e tipo de vaga.'
         )
   where id = 'da58673f-5dfd-4130-999b-5c987f353330'
     and meta_title is null
     and md5(meta_description) = '5f7e4f163534bd42c2780656ebe8d890'
     and md5(intro) = 'eea938205060299f746536869c6a758a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'seo viracopos: destination mudou desde a leitura de 27/11'; end if;
  if (select md5(intro) from public.destination where id = 'da58673f-5dfd-4130-999b-5c987f353330')
     <> 'd1d409504a8e2c5e22fe57280bc12403' then
    raise exception 'seo viracopos: intro saiu diferente do revisado';
  end if;

  -- 4a: dona de preço de VCP
  update public.blog_post
     set body_md = replace(
           replace(
             body_md,
             'São os mesmos que fecham a reserva em [Aeroporto de Viracopos na Movepark](/estacionamentos/aeroporto-viracopos).',
             'São os mesmos que fecham a reserva na página de [estacionamento Viracopos](/estacionamentos/aeroporto-viracopos) da Movepark.'
           ),
           'A página do [Aeroporto de Viracopos na Movepark](/estacionamentos/aeroporto-viracopos) lista',
           'A página de [estacionamento Viracopos](/estacionamentos/aeroporto-viracopos) da Movepark lista'
         )
   where slug = 'estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica'
     and md5(body_md) = '58e8c0bc73cb0c650414e7329d88e317';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'seo viracopos: dona de preço mudou desde a leitura de 27/11'; end if;
  if (select md5(body_md) from public.blog_post
       where slug = 'estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica')
     <> 'db3eab094eda9415162578587d34e489' then
    raise exception 'seo viracopos: dona de preço saiu diferente do revisado';
  end if;

  -- 4b: guia do aeroporto
  update public.blog_post
     set body_md = replace(
           body_md,
           'O Aeroporto de Viracopos oferece diversas opções de estacionamento para atender às diferentes necessidades dos passageiros. Veja algumas das principais opções de estacionamento',
           'Viracopos tem o estacionamento oficial e pátios particulares no entorno. A lista completa, com preço e distância de cada um, fica na página de [estacionamento Viracopos](/estacionamentos/aeroporto-viracopos). Estas são as principais opções:'
         )
   where slug = 'guia-completo-descubra-o-melhor-do-aeroporto-viracopos'
     and md5(body_md) = '6dc85b0873066c5cfb4be018e198e2ba';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'seo viracopos: guia do aeroporto mudou desde a leitura de 27/11'; end if;
  if (select md5(body_md) from public.blog_post where slug = 'guia-completo-descubra-o-melhor-do-aeroporto-viracopos')
     <> 'd01e0d83b8f350a7377898c54643fbf9' then
    raise exception 'seo viracopos: guia do aeroporto saiu diferente do revisado';
  end if;
end
$vcp$;
