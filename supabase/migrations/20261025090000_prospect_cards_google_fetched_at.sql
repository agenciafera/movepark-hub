-- O card do lote mapeado passa a receber `google_fetched_at` (§5 e §6 de
-- docs/specs/avaliacoes-google.md).
--
-- O buraco que isto fecha: a página `/destinos/<slug>` prefere o dado do LOADER ao do hook,
-- e o loader roda no BUILD. Ou seja, o HTML publicado carrega a nota que era verdade no dia
-- do build e continua servindo ela na borda até o próximo deploy. A policy de leitura e o
-- join desta RPC filtram os 30 dias na hora da consulta, e nenhum dos dois alcança um HTML
-- congelado: a página construída no dia 0 servia nota do Google no dia 31, e um `is_hidden`
-- ligado no dia 1 nunca chegava nela.
--
-- Sem esta coluna o card não tinha como se defender, porque `isSnapshotFresh` precisa da
-- data da coleta. É a mesma defesa que `GoogleReviewsBlock` (ficha) e `buildStaticUnits`
-- (semente do destino) já aplicam. O join continua filtrando: quem chega pela navegação no
-- cliente já recebe só linha fresca, e o guard do componente cobre o HTML velho.
--
-- `drop` antes do `create`: acrescentar coluna ao `returns table` muda o tipo de retorno, e
-- `create or replace function` recusa. O `grant execute` é refeito porque o drop leva o
-- antigo. Mesmo procedimento do `20261024093000_prospect_cards_google_rating.sql`, e todas
-- as colunas e o comportamento de lá continuam iguais.

drop function if exists public.destination_prospect_cards(text);

create function public.destination_prospect_cards(p_destination_slug text)
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
  reference_name text,
  google_place_id text,
  google_rating numeric,
  google_rating_count integer,
  google_fetched_at timestamptz
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
    np.name as reference_name,
    p.google_place_id,
    g.rating as google_rating,
    coalesce(g.user_rating_count, 0) as google_rating_count,
    g.fetched_at as google_fetched_at
  from public.destination d
  join public.prospect_location p on p.destination_id = d.id
  left join lateral (
    select dp.name, dp.geog
    from public.destination_point dp
    where dp.destination_id = d.id
    order by st_distance(p.geog, dp.geog) asc
    limit 1
  ) np on true
  left join public.google_place_snapshot g
    on g.place_id = p.google_place_id
   and not g.is_hidden
   and g.fetched_at > now() - interval '30 days'
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
  'Lotes mapeados publicados de um destino, com distância ao terminal por ST_Distance (ADR-001) e a nota do Google do snapshot fresco (§6 de avaliacoes-google.md). SECURITY INVOKER de propósito: respeita o grant de coluna que esconde o telefone (Q-021) e a RLS que esconde rascunho e ficha convertida. O join do snapshot repete `is_hidden` e os 30 dias porque hub_admin enxerga além da policy de leitura. `google_fetched_at` volta junto porque o card sai no HTML do build, e HTML publicado também é cache do Google: sem a data da coleta o componente não tem como se recusar a exibir nota vencida.';

grant execute on function public.destination_prospect_cards(text) to anon, authenticated;
