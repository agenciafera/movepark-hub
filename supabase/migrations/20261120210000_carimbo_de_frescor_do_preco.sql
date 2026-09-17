-- Carimbo de frescor do preço, por destino (Conteúdo 26, Fase 2 do plano de conteúdo).
--
-- `/precos` e `/precos/<slug>` já mostram "tabela de parceiro mais recente de <data>", mas o
-- dado sai do `destination_price_index`, que roda o motor de preço inteiro (simulate_price por
-- unidade e por duração). O post do blog só precisa da DATA, e pagar a matriz de preço para
-- ler um `max(updated_at)` custaria o pipeline inteiro em cada um dos 95 loaders do build.
--
-- Esta função devolve só o carimbo, com o MESMO corte do índice (empresa ativa e com onboarding
-- ativo, unidade listada e ativa, vaga ativa e com regra de preço), para as duas superfícies
-- nunca divergirem em data. Espelhar o corte é de propósito: um carimbo mais frouxo dataria a
-- página por uma tabela que ela não mostra.
--
-- SECURITY INVOKER, como o `destination_price_index`: roda com a RLS de quem chama, e os filtros
-- abaixo repetem as mesmas condições das policies `catalog_read_*`. Nenhum campo novo é exposto;
-- a data já aparece hoje no índice de preços.
create or replace function public.destination_price_freshness(
  p_destination text default null
)
returns table (destination_slug text, price_updated_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select d.slug, max(pr.updated_at)
  from destination d
  join location l on l.destination_id = d.id
    and l.is_listed and l.deleted_at is null and l.status = 'active'
  join company c on c.id = l.company_id
    and c.deleted_at is null and c.status = 'active' and c.onboarding_status = 'active'
  join location_parking_type lpt on lpt.location_id = l.id and lpt.is_active
  join company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active
  join pricing_rule pr on pr.location_parking_type_id = lpt.id
  where d.is_published
    and (p_destination is null or d.slug = p_destination)
  group by d.slug
  having max(pr.updated_at) is not null;
$$;

comment on function public.destination_price_freshness(text) is
  'Data da tabela de preço mais recente por destino publicado, com o mesmo corte do destination_price_index. Alimenta o carimbo de frescor visível e o dateModified do schema.';

grant execute on function public.destination_price_freshness(text) to anon, authenticated;
