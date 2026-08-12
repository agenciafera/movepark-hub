-- popular_parking_types passa a devolver quantas reservas sustentam cada linha.
--
-- A home ordena por venda, mas a maior parte do catálogo ainda não vendeu nada pelo Hub: hoje
-- 4 unidades respondem por todas as reservas, e as demais empatam em zero. No empate a ordem
-- caía sempre na mesma sequência (review_count, popular_sort_order, created_at), então as mesmas
-- unidades ficavam eternamente na frente das outras sem nenhum dado que justificasse.
--
-- Com a contagem exposta, o front sabe onde termina o ranking de verdade e embaralha só o resto,
-- dando vez a quem ainda não vendeu (inclusive os lotes de checkout externo). A contagem não vai
-- para a tela: serve de corte, no mesmo princípio de `locations_high_demand_today`, que também
-- devolve presença e nunca o número.
--
-- Muda o RETURNS TABLE, então precisa de drop + create.

drop function if exists public.popular_parking_types(integer);

create function public.popular_parking_types(p_limit integer default 6)
returns table(
  id uuid,
  location_id uuid,
  operator_slug text,
  location_slug text,
  parking_type_code text,
  bookings_count bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    lpt.id,
    l.id as location_id,
    c.slug as operator_slug,
    l.slug as location_slug,
    pt.code as parking_type_code,
    count(distinct b.id) as bookings_count
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
  group by lpt.id, l.id, c.slug, l.slug, pt.code, l.review_count, l.popular_sort_order, l.created_at
  order by
    count(distinct b.id) desc,
    l.review_count desc nulls last,
    l.popular_sort_order asc nulls last,
    l.created_at asc,
    lpt.id asc
  limit greatest(coalesce(p_limit, 6), 0);
$function$;

comment on function public.popular_parking_types(integer) is
  'Ranking de tipos de vaga por reservas confirmadas, com a contagem que sustenta cada linha. '
  'A home usa a contagem só para separar quem tem histórico de quem ainda não vendeu.';

-- A home é pública: `revoke from public` não tira o grant de anon, então os dois vão explícitos.
revoke all on function public.popular_parking_types(integer) from public, anon;
grant execute on function public.popular_parking_types(integer) to anon, authenticated, service_role;
