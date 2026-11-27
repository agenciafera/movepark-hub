-- A Aerovalet deixou a Movepark (27/11/2026): os links do blog para as fichas dela passam a
-- apontar para a página do aeroporto.
--
-- Empresa e as três unidades foram despublicadas no Manager às 11:38 (Brasília). O build
-- seguinte parou no guarda de links internos (`check-internal-links.mjs`): 27 links em 20
-- versões de post (10 em português, 10 traduções em en/es) apontavam para
-- `/estacionamentos/aeroporto-guarulhos/aerovalet` e `/estacionamentos/aeroporto-congonhas/aerovalet`,
-- que deixaram de existir. Nada ia ao ar desde então.
--
-- Decisão do Kallef: o tráfego da Aerovalet vai para a página do aeroporto, onde estão os outros
-- estacionamentos. A ficha de Congonhas vai para a página de Congonhas, e não para a de
-- Guarulhos, porque o post é sobre Congonhas. Só o destino do link muda; o texto dos posts fica
-- como está nesta migration. O 301 das URLs antigas mora no Worker (`FICHA_DE_PARCEIRO_QUE_SAIU`).
--
-- Trava: confere a contagem medida antes (15 links em português, 12 nas traduções) e falha se
-- algo mudou entre a medição e a aplicação; depois confere que não sobrou nenhum.

do $$
declare
  v_pt int;
  v_i18n int;
begin
  select coalesce(sum((length(body_md) - length(replace(body_md, '/aerovalet)', ''))) / length('/aerovalet)')), 0)
    into v_pt
    from public.blog_post
   where body_md like '%/estacionamentos/aeroporto-guarulhos/aerovalet)%'
      or body_md like '%/estacionamentos/aeroporto-congonhas/aerovalet)%';
  select coalesce(sum((length(body_md) - length(replace(body_md, '/aerovalet)', ''))) / length('/aerovalet)')), 0)
    into v_i18n
    from public.blog_post_i18n
   where body_md like '%/estacionamentos/aeroporto-guarulhos/aerovalet)%'
      or body_md like '%/estacionamentos/aeroporto-congonhas/aerovalet)%';
  if v_pt <> 15 or v_i18n <> 12 then
    raise exception 'Contagem de links da Aerovalet mudou: % em português (esperado 15), % nas traduções (esperado 12)', v_pt, v_i18n;
  end if;

  update public.blog_post
     set body_md = replace(
           replace(body_md, '](/estacionamentos/aeroporto-guarulhos/aerovalet)', '](/estacionamentos/aeroporto-guarulhos)'),
           '](/estacionamentos/aeroporto-congonhas/aerovalet)', '](/estacionamentos/aeroporto-congonhas)')
   where body_md like '%/estacionamentos/aeroporto-guarulhos/aerovalet)%'
      or body_md like '%/estacionamentos/aeroporto-congonhas/aerovalet)%';

  update public.blog_post_i18n
     set body_md = replace(
           replace(body_md, '](/estacionamentos/aeroporto-guarulhos/aerovalet)', '](/estacionamentos/aeroporto-guarulhos)'),
           '](/estacionamentos/aeroporto-congonhas/aerovalet)', '](/estacionamentos/aeroporto-congonhas)')
   where body_md like '%/estacionamentos/aeroporto-guarulhos/aerovalet)%'
      or body_md like '%/estacionamentos/aeroporto-congonhas/aerovalet)%';

  if exists (select 1 from public.blog_post where body_md ~ '/estacionamentos/[a-z0-9-]+/aerovalet\y')
     or exists (select 1 from public.blog_post_i18n where body_md ~ '/estacionamentos/[a-z0-9-]+/aerovalet\y') then
    raise exception 'Sobrou link de post para ficha da Aerovalet';
  end if;
end $$;
