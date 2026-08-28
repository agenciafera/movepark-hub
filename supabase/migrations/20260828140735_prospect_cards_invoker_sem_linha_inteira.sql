-- Reverte o atalho de 20260828140521 (prospect_cards_definer): DEFINER "resolvia" o
-- permission denied do anon contornando o corte de colunas do Q-021, e o pgTAP de
-- prospect_cards trava a função como INVOKER de propósito. O conserto de verdade:
--   1. grant de coluna nas públicas novas (public_slug/public_name chegaram do trabalho
--      de white-label sem grant, e são públicas por definição: compõem a URL da ficha);
--   2. public_path inline em vez de prospect_public_path(p), porque passar a LINHA
--      INTEIRA exige SELECT em TODAS as colunas, inclusive o telefone escondido, e foi
--      isso que derrubou o anon (vitrine de lotes mapeados sumiu do build de 28/08).
-- O bloco é condicional porque as colunas white-label ainda não existem no stack do CI
-- (a migration delas é live-only até a frente de white-label commitar): sem elas, a
-- função do repo nem referencia public_slug e já funciona.
alter function public.destination_prospect_cards(text) security invoker;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prospect_location'
      and column_name = 'public_slug'
  ) then
    return;
  end if;

  grant select (public_slug, public_name) on public.prospect_location to anon, authenticated;

  execute $fn$
    create or replace function public.destination_prospect_cards(p_destination_slug text)
    returns table(
      id uuid, name text, slug text, public_slug text, public_name text, public_path text,
      address text, latitude numeric, longitude numeric, google_maps_url text,
      amenities jsonb, description text, distance_km numeric, reference_name text,
      google_place_id text, google_rating numeric, google_rating_count integer,
      google_fetched_at timestamp with time zone
    )
    language sql
    stable
    set search_path to 'public', 'extensions'
    as $body$
      select
        p.id,
        p.name,
        p.slug,
        p.public_slug,
        p.public_name,
        case
          when d.public_slug is not null and p.public_slug is not null
            then '/estacionamentos/' || d.public_slug || '/' || p.public_slug
        end as public_path,
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
      where (d.slug = p_destination_slug or d.public_slug = p_destination_slug)
        and d.is_published
        and p.is_published
        and p.converted_at is null
      order by distance_km asc nulls last, p.name asc;
    $body$;
  $fn$;
end $$;
