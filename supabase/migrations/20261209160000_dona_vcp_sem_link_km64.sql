-- Destrava o deploy: a dona de preço de VCP linkava a ficha do KM64, que a migration
-- 20261209150000 tirou do ar (is_published = false, 301 para o Ouro Park no worker).
--
-- O check-internal-links do build reprova link para ficha que não existe no build, porque o 301
-- do worker não vale na navegação do React Router. Com isso nenhum build publicava desde o
-- cab441ea (15:30 UTC de 27/11/2026). Aqui o nome "KM64" perde só o link, e o texto fica como
-- está: o que dizer do KM64 nesse post é decisão de conteúdo, fora desta correção.
--
-- Só muda se o md5 ainda for o que a migration 20261209140000 deixou.

do $km64$
declare
  n int;
begin
  if not exists (select 1 from public.blog_post
                  where slug = 'estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica') then
    raise notice 'dona vcp sem km64: banco sem o acervo, nada a revisar';
    return;
  end if;

  update public.blog_post
     set body_md = replace(body_md, 'O [KM64](/estacionamentos/aeroporto-viracopos/km64) fica', 'O KM64 fica')
   where slug = 'estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica'
     and md5(body_md) = 'db3eab094eda9415162578587d34e489';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'dona vcp sem km64: o post mudou desde a migration 20261209140000'; end if;

  if exists (select 1 from public.blog_post
              where slug = 'estacionamento-aeroporto-viracopos-vcp-guia-completo-com-precos-opcoes-e-a-melhor-escolha-economica'
                and body_md like '%/estacionamentos/aeroporto-viracopos/km64%') then
    raise exception 'dona vcp sem km64: o link para a ficha do KM64 continua no post';
  end if;
end
$km64$;
