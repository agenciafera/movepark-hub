-- Índice público de preços por destino (superfície /precos, spec docs/specs/indice-precos.md).
--
-- Uma chamada devolve, por destino publicado, as unidades LISTADAS com a matriz de preço nas
-- durações pedidas (default 1/7/15/30 diárias), calculada pelo motor real (`simulate_price`),
-- mais o preço de balcão (`old_price`), a distância PostGIS até o destino (ADR-001) e a estadia
-- mínima. É o que alimenta o loader SSG das páginas /precos e /precos/<slug> e o gêmeo Markdown
-- do build (generate-geo-artifacts): sem ela seriam 4 × N chamadas de simulate_price por página.
--
-- SECURITY INVOKER de propósito, como destination_prospect_cards: roda com a RLS de quem chama.
-- Para `anon` valem as policies catalog_read_* (empresa ativa + onboarding ativo, unidade listada
-- e ativa, vaga ativa), e os filtros explícitos abaixo espelham essas mesmas condições para que
-- o resultado seja o mesmo em qualquer papel. O preço em si vem de simulate_price, que já é
-- SECURITY DEFINER e pública. Nenhum campo novo é exposto: tudo aqui já aparece na vitrine.

create or replace function public.destination_price_index(
  p_days integer[] default array[1, 7, 15, 30],
  p_destination text default null
)
returns jsonb
language plpgsql
stable
-- extensions no path porque o PostGIS (st_distance) mora no schema extensions.
set search_path = public, extensions
as $$
declare
  v_days integer[];
  v_result jsonb;
begin
  -- Sanea a entrada: durações válidas (1..60), sem duplicata, ordenadas, no máximo 8.
  -- É função pública chamável por anon; sem o teto, um array grande viraria um
  -- multiplicador de chamadas do motor de preço.
  select array_agg(distinct d order by d) into v_days
  from unnest(coalesce(p_days, array[1, 7, 15, 30])) d
  where d between 1 and 60;

  if v_days is null or cardinality(v_days) > 8 then
    raise exception 'p_days inválido: informe de 1 a 8 durações entre 1 e 60 diárias';
  end if;

  -- MATERIALIZED nos CTEs: sem isso o planner inlina o pipeline de simulate_price
  -- dentro do select final e o recalcula por destino e por filtro (medido: ~1,9s na
  -- versao inlined contra ~0,25s materializada, com 76 chamadas virando ~720).
  with dest as materialized (
    select d.id, d.slug, d.code, d.name, d.short_name, d.type, d.city, d.state,
           d.sort_order, d.geog
    from destination d
    where d.is_published
      and (p_destination is null or d.slug = p_destination)
  ),
  unidade as materialized (
    select
      de.id as destination_id,
      c.slug as company_slug, c.name as company_name,
      l.slug as location_slug, l.name as location_name,
      l.checkout_mode, l.review_avg, l.review_count,
      l.has_shuttle, l.shuttle_to_terminal_minutes,
      round(st_distance(l.geog, de.geog))::int as distance_m,
      pt.code as parking_type_code, pt.name as parking_type_name,
      case when lpt.has_minimum_stay and lpt.minimum_stay_unit = 'days'
           then lpt.minimum_stay_value end as min_stay_days,
      (select max(pr.updated_at) from pricing_rule pr
        where pr.location_parking_type_id = lpt.id) as price_updated_at
    from dest de
    join location l on l.destination_id = de.id
      and l.is_listed and l.deleted_at is null and l.status = 'active'
    join company c on c.id = l.company_id
      and c.deleted_at is null and c.status = 'active' and c.onboarding_status = 'active'
    join location_parking_type lpt on lpt.location_id = l.id and lpt.is_active
    join company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active
    join parking_type pt on pt.id = cpt.parking_type_id
    where exists (select 1 from pricing_rule pr where pr.location_parking_type_id = lpt.id)
  ),
  precos as materialized (
    select u.destination_id, u.location_name, u.parking_type_code as ptc,
      jsonb_build_object(
        'company_slug', u.company_slug,
        'company_name', u.company_name,
        'location_slug', u.location_slug,
        'location_name', u.location_name,
        'parking_type_code', u.parking_type_code,
        'parking_type_name', u.parking_type_name,
        'checkout_mode', u.checkout_mode,
        'review_avg', u.review_avg,
        'review_count', u.review_count,
        'has_shuttle', u.has_shuttle,
        'shuttle_minutes', u.shuttle_to_terminal_minutes,
        'distance_m', u.distance_m,
        'min_stay_days', u.min_stay_days,
        'price_updated_at', u.price_updated_at,
        'prices', (
          select jsonb_agg(jsonb_build_object(
            'days', d,
            'total', (s.sim ->> 'price')::numeric,
            'old_total', (s.sim ->> 'old_price')::numeric
          ) order by d)
          from unnest(v_days) d
          cross join lateral (
            select simulate_price(u.company_slug, u.location_slug, u.parking_type_code, d) as sim
          ) s
        )
      ) as unit
    from unidade u
  ),
  -- Unidade sem preço em NENHUMA duração (regra quebrada, espelho vazio) não entra:
  -- linha toda "sob consulta" é o que o índice existe para não ter.
  com_preco as materialized (
    select * from precos p
    where exists (
      select 1 from jsonb_array_elements(p.unit -> 'prices') e
      where e ->> 'total' is not null
    )
  )
  select jsonb_build_object(
    'days', to_jsonb(v_days),
    'destinations', coalesce((
      select jsonb_agg(obj order by sort_order)
      from (
        select de.sort_order, jsonb_build_object(
          'slug', de.slug, 'code', de.code, 'name', de.name,
          'short_name', de.short_name, 'type', de.type,
          'city', de.city, 'state', de.state,
          'units', (
            select jsonb_agg(cp.unit order by cp.location_name, cp.ptc)
            from com_preco cp
            where cp.destination_id = de.id
          )
        ) as obj
        from dest de
      ) x
      where obj -> 'units' is not null and obj -> 'units' <> 'null'::jsonb
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.destination_price_index(integer[], text) is
  'Matriz pública de preços por destino (1/7/15/30 diárias por default): unidades listadas com preço do motor (simulate_price), balcão (old_price), distância ao destino e estadia mínima. Alimenta /precos e /precos/<slug> no build SSG. Ver docs/specs/indice-precos.md.';

-- Superfície mínima e explícita: leitura pública (é a vitrine), sem PUBLIC implícito.
revoke all on function public.destination_price_index(integer[], text) from public;
grant execute on function public.destination_price_index(integer[], text)
  to anon, authenticated, service_role;
