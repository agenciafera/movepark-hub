-- Vitrine da home por tipo de vaga (86ajnfwgx). Irmã da popular_locations: em vez de ranquear
-- location por nº de reservas, ranqueia (unidade, tipo de vaga) por venda daquele tipo. A home passa
-- a ser card por tipo, com teto de 1 por empresa aplicado no cliente (dedupePopularOffers).
--
-- Venda por tipo = reservas do booking cujo booking_item aponta pra aquele parking_type, na unidade
-- daquele lpt. Mesma janela de status da popular_locations (confirmed/checked_in/completed/no_show).
-- Mesmo desempate: review_count, depois popular_sort_order (curadoria explícita, já que 53 dos 56
-- tipos ativos têm zero venda), depois created_at. Só unidades listadas (a vitrine é pública).

create or replace function public.popular_parking_types(p_limit integer default 6)
returns table (
  id uuid,
  location_id uuid,
  operator_slug text,
  location_slug text,
  parking_type_code text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    lpt.id,
    l.id as location_id,
    c.slug as operator_slug,
    l.slug as location_slug,
    pt.code as parking_type_code
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.booking_item bi on bi.parking_type_id = pt.id
  left join public.booking b
    on b.id = bi.booking_id
   and b.location_id = l.id
   and b.status in ('confirmed', 'checked_in', 'completed', 'no_show')
  where lpt.is_active
    and l.status = 'active'
    and l.deleted_at is null
    and l.is_listed
  group by lpt.id, c.slug, l.slug, pt.code, l.review_count, l.popular_sort_order, l.created_at
  order by
    count(distinct b.id) desc,
    l.review_count desc nulls last,
    l.popular_sort_order asc nulls last,
    l.created_at asc,
    -- Desempate final único: sem ele, tipos sem venda (a maioria) com created_at empatado no seed
    -- saem em ordem não determinística, e a vitrine mudaria de composição entre chamadas.
    lpt.id asc
  limit greatest(coalesce(p_limit, 6), 0);
$$;

comment on function public.popular_parking_types(integer) is
  'Ranking de (unidade, tipo de vaga) por venda daquele tipo, para a vitrine da home. Irmã da '
  'popular_locations, que ranqueia por unidade. Ver 86ajnfwgx.';

grant execute on function public.popular_parking_types(integer) to anon, authenticated, service_role;
