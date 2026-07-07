-- Home · "Estacionamentos populares" deixa de ser curadoria manual (is_popular) e passa a ranquear
-- por NÚMERO DE RESERVAS (o "mais vendidos"). Zero-safe: com 0 reservas ainda devolve os lotes,
-- numa ordem determinística (review_count → popular_sort_order → created_at), e o ranking real
-- "emerge" conforme as reservas entram.
--
-- SECURITY DEFINER porque agrega a tabela booking (RLS bloqueia o anon de contar). Devolve SÓ os
-- IDs ordenados — nunca o número de reservas por lote (não vaza volume de vendas). É consumo público
-- da home (anon), expondo apenas IDs de locations ativas que já aparecem na busca.
create or replace function public.popular_locations(p_limit integer default 6)
returns table (id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select l.id
  from public.location l
  -- status "vendido" (reserva paga); pending/cancelled não contam. Filtro no ON p/ manter
  -- locations com 0 reservas (left join + count = 0).
  left join public.booking b
    on b.location_id = l.id
   and b.status in ('confirmed', 'checked_in', 'completed', 'no_show')
  where l.status = 'active' and l.deleted_at is null
  group by l.id  -- PK → demais colunas de location ficam disponíveis no ORDER BY
  order by
    count(b.id) desc,                       -- mais reservados primeiro
    l.review_count desc nulls last,         -- desempate estável (enquanto reservas = 0)
    l.popular_sort_order asc nulls last,    -- curadoria como nudge de desempate
    l.created_at asc
  limit greatest(coalesce(p_limit, 6), 0);
$$;

revoke all on function public.popular_locations(integer) from public;
grant execute on function public.popular_locations(integer) to anon, authenticated, service_role;
