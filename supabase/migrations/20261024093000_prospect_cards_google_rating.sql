-- Avaliações do Google no card e na ficha do lote mapeado (§6 de docs/specs/avaliacoes-google.md).
--
-- Por que a nota passa pela RPC em vez de um fetch do front: o
-- `20261009000000_prospect_location_public_columns.sql` (Q-021) revogou o SELECT da tabela
-- inteira e devolveu coluna a coluna, e `google_place_id` ficou de fora. O front anônimo não
-- lê o place_id do lote, então não tem como buscar o snapshot sozinho. A nota sai pronta daqui.
--
-- A função continua SECURITY INVOKER, e isso não é descuido: virar definer contornaria o grant
-- de coluna e devolveria o telefone sem querer, que é exatamente o que Q-021 fechou. O preço de
-- continuar invoker é precisar do grant abaixo, porque em função invoker o Postgres cobra o
-- privilégio de coluna de quem chama, mesmo quando a coluna só aparece na condição do join.
--
-- Por que expor `google_place_id` é seguro: ele já é público NESTA MESMA PÁGINA. O
-- `google_maps_url` que o card mostra é literalmente
-- `https://www.google.com/maps/place/?q=place_id:ChIJ...`, ou seja, o place_id em texto claro
-- dentro do link. Ele volta no retorno porque a ficha do lote (E0.17-e) usa o place_id para
-- carregar o snapshot inteiro (reviews, maps_uri, fetched_at) no loader do SSG. O telefone
-- continua fora do grant e fora do retorno.
--
-- Frescor e `is_hidden` filtrados no join, e não só pela policy: a policy de escrita de
-- `google_place_snapshot` é `for all` gateada em `is_hub_admin()`, e policies permissivas se
-- somam, então um admin logado LÊ linha oculta e linha vencida. Sem estas duas condições a
-- página pública mudaria de conteúdo só porque quem abriu estava logado como admin, que é o
-- mesmo motivo do filtro explícito de `p.is_published` mais abaixo. Os 30 dias são o limite de
-- cache do Google para conteúdo do Places, e valem para todo mundo.
--
-- `drop` antes do `create`: acrescentar coluna ao `returns table` muda o tipo de retorno, e
-- `create or replace function` recusa. O `grant execute` é refeito porque o drop leva o antigo.

grant select (google_place_id) on public.prospect_location to anon, authenticated;

comment on column public.prospect_location.google_place_id is
  'Place ID do Google. Legível por anon (grant de coluna) porque o `google_maps_url` já publica o mesmo valor no link do Maps que o card mostra, e porque a ficha e a RPC precisam dele para achar o snapshot de avaliações. Não confundir com `phone`, esse sim sem SELECT público (Q-021).';

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
  google_rating_count integer
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
    coalesce(g.user_rating_count, 0) as google_rating_count
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
  'Lotes mapeados publicados de um destino, com distância ao terminal por ST_Distance (ADR-001) e a nota do Google do snapshot fresco (§6 de avaliacoes-google.md). SECURITY INVOKER de propósito: respeita o grant de coluna que esconde o telefone (Q-021) e a RLS que esconde rascunho e ficha convertida. O join do snapshot repete `is_hidden` e os 30 dias porque hub_admin enxerga além da policy de leitura.';

grant execute on function public.destination_prospect_cards(text) to anon, authenticated;
