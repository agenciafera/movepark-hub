-- Ocupação por dia, Hub e white-label, para os dashboards (13/11/2026).
--
-- O dashboard do Manager filtrado por uma unidade de white-label só tinha receita: nenhum card de
-- ocupação, e o do parceiro lia a ocupação do site em `location_parking_availability
-- .external_booked_count`, que só existe para empresa com a sincronização de disponibilidade
-- ligada (BePark, Virapark, Abbapark). A Aerovalet Congonhas, com 182 reservas pagas no site em 30
-- dias, aparecia vazia.
--
-- Esta função conta direto das reservas: `booking` (Hub) e `wl_booking` (o espelho do site, que
-- existe para todo white-label). Onde a sincronização existe os números batem (Virapark em
-- 05/11/2026: 1.064 carros pelo espelho, ~1.077 pela sincronização).
--
-- Regras:
-- - Um carro ocupa a vaga em cada data de `check_in_at::date` até `(check_out_at - 1µs)::date`, a
--   mesma conta do `booked_count` (create_booking_atomic), para o gráfico bater com a tela de
--   Ocupação.
-- - Hub conta reserva que virou venda e não foi desfeita: confirmed, checked_in, completed.
--   Site conta `status = 'confirmed'` (pago e de pé; o espelho guarda o status do site), fora as
--   marcadas como duplicadas (`is_duplicate`), como o resumo diário da equipe.
-- - Capacidade do dia: soma das vagas dos tipos ativos da unidade, fora os tipos bloqueados
--   naquela data.
-- - Acesso: hub_admin vê tudo; o membro da empresa vê as unidades das empresas dele em que tem
--   `occupancy:read` (ADR-005). Unidade fora disso some do resultado, como numa RLS, porque a
--   função soma várias unidades de uma vez. `p_location_ids` nulo = todas as que a pessoa vê.

create or replace function public.location_occupancy_daily(
  p_from date,
  p_to date,
  p_location_ids uuid[] default null
) returns table(date date, capacity integer, hub integer, wl integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with
  unidades as (
    select l.id
      from public.location l
     where l.deleted_at is null
       and (p_location_ids is null or l.id = any (p_location_ids))
       and (
         public.is_hub_admin()
         or (
           exists (
             select 1 from public.profile_company pc
              where pc.profile_id = auth.uid() and pc.company_id = l.company_id
           )
           and public.member_has_scope(l.company_id, 'occupancy:read')
         )
       )
  ),
  dias as (
    select d::date as date
      from generate_series(p_from, p_to, interval '1 day') d
     where p_to >= p_from and p_to - p_from <= 400
  ),
  capacidade as (
    select dd.date, sum(lpt.capacity)::integer as capacity
      from dias dd
      join public.location_parking_type lpt
        on lpt.location_id in (select id from unidades) and lpt.is_active
      left join public.location_parking_availability a
        on a.location_parking_type_id = lpt.id and a.date = dd.date
     where not coalesce(a.blocked, false)
     group by dd.date
  ),
  hub as (
    select dd.date, count(*)::integer as n
      from public.booking b
      join dias dd
        on dd.date between b.check_in_at::date and (b.check_out_at - interval '1 microsecond')::date
     where b.location_id in (select id from unidades)
       and b.deleted_at is null
       and b.status in ('confirmed', 'checked_in', 'completed')
       and b.check_in_at < (p_to + 1)::timestamptz
       and b.check_out_at > p_from::timestamptz
     group by dd.date
  ),
  site as (
    select dd.date, count(*)::integer as n
      from public.wl_booking w
      join dias dd
        on dd.date between w.check_in_at::date and (w.check_out_at - interval '1 microsecond')::date
     where w.location_id in (select id from unidades)
       and w.status = 'confirmed'
       and not coalesce(w.is_duplicate, false)
       and w.check_in_at < (p_to + 1)::timestamptz
       and w.check_out_at > p_from::timestamptz
     group by dd.date
  )
  select dd.date,
         coalesce(c.capacity, 0),
         coalesce(h.n, 0),
         coalesce(s.n, 0)
    from dias dd
    left join capacidade c on c.date = dd.date
    left join hub h on h.date = dd.date
    left join site s on s.date = dd.date
   order by dd.date;
$function$;

comment on function public.location_occupancy_daily(date, date, uuid[]) is
  'Ocupação por dia (capacidade, carros do Hub e do site white-label) das unidades pedidas que a pessoa pode ver com occupancy:read. Conta das reservas, com a mesma regra de datas do booked_count.';

revoke all on function public.location_occupancy_daily(date, date, uuid[]) from public, anon;
grant execute on function public.location_occupancy_daily(date, date, uuid[]) to authenticated, service_role;
