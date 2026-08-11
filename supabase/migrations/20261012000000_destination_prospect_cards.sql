-- E0.17-d · os cards de lote mapeado da página de destino.
--
-- A spec pedia UMA RPC com `union all` e um discriminador `kind`, para o front consumir
-- uma lista só. Não deu, e o motivo é bom: o lado vendável da página de destino NÃO é um
-- `select from location`. É a Edge `search`, que devolve preço calculado, disponibilidade
-- na janela, comodidades, nota e os selos de vantagem. Um `union all` em SQL teria que
-- largar tudo isso para caber na mesma linha do lado mapeado, que não tem preço nenhum.
--
-- Então são duas leituras, e o custo é pequeno: as duas seções já são separadas na tela,
-- paginam separado e ordenam por critérios diferentes (a própria spec exige isso). O que
-- a RPC única compraria era um fetch a menos; o que ela custaria era o preço sumir do
-- card vendável.
--
-- SECURITY INVOKER de propósito, e é o ponto: esta função só lê as colunas que `anon` já
-- pode ler depois de `20261009000000_prospect_location_public_columns.sql`. Fazer definer
-- aqui contornaria o grant de coluna e devolveria o telefone sem querer, que é
-- exatamente o que Q-021 fechou. A RLS também continua valendo, então rascunho e ficha
-- convertida não aparecem nem para quem chamar com JWT de admin.
--
-- Distância: ST_Distance sobre `geog` (ADR-001), nunca coluna. A referência é o TERMINAL
-- mais próximo quando o destino tem `destination_point` cadastrado, e o centro do destino
-- quando não tem. Isso não é atalho: em aeroporto de um terminal só (todos, menos GRU) a
-- geo do destino É a do terminal. O mesmo `round(km, 2)` de `locations_proximity`, para o
-- número bater com o do card vendável depois do `formatDistance` do front.
--
-- Ordenação por distância, e só. `is_popular` não existe aqui e não deve ser inventado:
-- ordenar lote mapeado por "popularidade" seria editorial sobre quem não é parceiro.
--
-- Ver docs/specs/lote-mapeado-vitrine.md.

create or replace function public.destination_prospect_cards(p_destination_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  address text,
  latitude numeric,
  longitude numeric,
  google_maps_url text,
  amenities jsonb,
  description text,
  distance_km numeric,
  reference_name text
)
language sql
stable
set search_path to 'public', 'extensions'
as $$
  select
    p.id,
    p.name,
    p.slug,
    p.address,
    p.latitude,
    p.longitude,
    p.google_maps_url,
    p.amenities,
    p.description,
    round((st_distance(p.geog, coalesce(np.geog, d.geog)) / 1000.0)::numeric, 2) as distance_km,
    np.name as reference_name
  from public.destination d
  join public.prospect_location p on p.destination_id = d.id
  left join lateral (
    select dp.name, dp.geog
    from public.destination_point dp
    where dp.destination_id = d.id
    order by st_distance(p.geog, dp.geog) asc
    limit 1
  ) np on true
  where d.slug = p_destination_slug
    and d.is_published
    -- Filtro explícito, mesmo com a RLS cobrindo: para `hub_admin` a policy libera
    -- rascunho e ficha convertida, e a página pública não pode mudar de conteúdo só
    -- porque quem abriu estava logado como admin. Ficha convertida virou `location` e
    -- apareceria duas vezes na mesma página.
    and p.is_published
    and p.converted_at is null
  order by distance_km asc nulls last, p.name asc;
$$;

comment on function public.destination_prospect_cards(text) is
  'Lotes mapeados publicados de um destino, com distância ao terminal por ST_Distance (ADR-001). SECURITY INVOKER de propósito: respeita o grant de coluna que esconde o telefone (Q-021) e a RLS que esconde rascunho e ficha convertida.';

grant execute on function public.destination_prospect_cards(text) to anon, authenticated;
