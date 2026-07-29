-- Dashboard do Manager: indicadores de operação herdados do backoffice legado
-- (Visão Geral e Visão Diária) que o Hub ainda não tinha.
--
-- Duas RPCs SECURITY DEFINER, gateadas por is_hub_admin():
--   manager_dashboard_overview(from, to) → resumo do período, comparação com o
--     período anterior, quebra por destino, distribuição de permanência,
--     top unidades e novos x recorrentes.
--   manager_daily_flow(date) → fluxo horário de entradas e saídas, com
--     passageiros e PCDs, no fuso de cada unidade.
--
-- O cálculo mora no banco: o front só exibe. O eixo de data do overview é o
-- check-in (quando o carro ocupa a vaga), a mesma leitura de operação do
-- legado. A aquisição por origem/UTM continua em booking_attribution, que
-- roda no eixo de created_at.
--
-- Diária ("vaga-dia") segue a convenção da capacidade: dia-calendário ocupado,
-- de check_in_at::date até (check_out_at - 1µs)::date, então uma estadia no
-- mesmo dia conta 1.

create or replace function public.manager_dashboard_overview(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_span interval;
  v_prev_from timestamptz;
  v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para o dashboard do Manager.' using errcode = '42501';
  end if;

  v_span := p_to - p_from;
  v_prev_from := p_from - v_span;

  with b as (
    select
      bk.id,
      bk.status::text as status,
      bk.total_amount,
      bk.fare_price_cents,
      coalesce(bk.passenger_count, 0) as passenger_count,
      bk.has_pcd,
      bk.created_at,
      bk.profile_id,
      bk.customer_email,
      bk.location_id,
      ((bk.check_out_at - interval '1 microsecond')::date - bk.check_in_at::date) + 1 as stay_days,
      bk.status in ('confirmed', 'checked_in', 'completed') as is_paid,
      bk.check_in_at >= p_from as is_current
    from public.booking bk
    where bk.deleted_at is null
      and bk.check_in_at >= v_prev_from
      and bk.check_in_at < p_to
  ),
  cur as (select * from b where is_current),
  cur_paid as (select * from cur where is_paid),
  prev_paid as (select * from b where not is_current and is_paid),
  customers as (
    select
      count(*) filter (where is_first) as new_customers,
      count(*) filter (where not is_first) as returning_customers
    from (
      -- O desempate por id importa: reservas gravadas na mesma transação (carga,
      -- seed, teste) empatam em created_at e, só por data, todas passariam por
      -- "primeira compra". Com (created_at, id) sobra exatamente uma primeira.
      select not exists (
        select 1
        from public.booking b2
        where b2.deleted_at is null
          and b2.status in ('confirmed', 'checked_in', 'completed')
          and (b2.created_at, b2.id) < (c.created_at, c.id)
          and coalesce(b2.profile_id::text, lower(b2.customer_email))
              = coalesce(c.profile_id::text, lower(c.customer_email))
      ) as is_first
      from cur_paid c
      where coalesce(c.profile_id::text, lower(c.customer_email)) is not null
    ) t
  ),
  by_destination as (
    select
      coalesce(d.code, '-') as code,
      coalesce(d.short_name, d.name, 'Sem destino') as name,
      count(*)::int as bookings,
      coalesce(sum(c.total_amount), 0) as revenue,
      coalesce(sum(c.stay_days), 0)::int as vehicle_days
    from cur_paid c
    join public.location l on l.id = c.location_id
    left join public.destination d on d.id = l.destination_id
    group by 1, 2
  ),
  by_stay as (
    select
      case
        when stay_days <= 1 then 1
        when stay_days <= 3 then 2
        when stay_days <= 6 then 3
        when stay_days <= 14 then 4
        when stay_days <= 29 then 5
        else 6
      end as sort,
      count(*)::int as bookings,
      coalesce(sum(total_amount), 0) as revenue,
      coalesce(sum(stay_days), 0)::int as vehicle_days
    from cur_paid
    group by 1
  ),
  top_locations as (
    select
      l.id,
      l.name,
      co.name as company_name,
      count(*)::int as bookings,
      coalesce(sum(c.total_amount), 0) as revenue,
      coalesce(sum(c.stay_days), 0)::int as vehicle_days
    from cur_paid c
    join public.location l on l.id = c.location_id
    join public.company co on co.id = l.company_id
    group by 1, 2, 3
    order by 5 desc
    limit 8
  )
  select jsonb_build_object(
    'current', (
      select jsonb_build_object(
        'bookings', count(*),
        'revenue', coalesce(sum(total_amount), 0),
        'ticket', case when count(*) > 0 then coalesce(sum(total_amount), 0) / count(*) else 0 end,
        'vehicle_days', coalesce(sum(stay_days), 0),
        'revenue_per_vehicle_day', case
          when coalesce(sum(stay_days), 0) > 0 then coalesce(sum(total_amount), 0) / sum(stay_days)
          else 0 end,
        'avg_stay_days', case
          when count(*) > 0 then coalesce(sum(stay_days), 0)::numeric / count(*) else 0 end,
        'passengers', coalesce(sum(passenger_count), 0),
        'pcd', count(*) filter (where has_pcd),
        'fare_revenue', coalesce(sum(fare_price_cents), 0) / 100.0
      )
      from cur_paid
    ),
    'previous', (
      select jsonb_build_object(
        'bookings', count(*),
        'revenue', coalesce(sum(total_amount), 0),
        'ticket', case when count(*) > 0 then coalesce(sum(total_amount), 0) / count(*) else 0 end,
        'vehicle_days', coalesce(sum(stay_days), 0)
      )
      from prev_paid
    ),
    'statuses', (
      select jsonb_build_object(
        'total', count(*),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'no_show', count(*) filter (where status = 'no_show'),
        'expired', count(*) filter (where status = 'expired'),
        'pending', count(*) filter (where status = 'pending')
      )
      from cur
    ),
    'customers', (
      select jsonb_build_object(
        'new', coalesce(new_customers, 0),
        'returning', coalesce(returning_customers, 0)
      )
      from customers
    ),
    'by_destination', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', code, 'name', name, 'bookings', bookings,
        'revenue', revenue, 'vehicle_days', vehicle_days
      ) order by revenue desc)
      from by_destination
    ), '[]'::jsonb),
    'length_of_stay', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sort', sort, 'bookings', bookings, 'revenue', revenue, 'vehicle_days', vehicle_days
      ) order by sort)
      from by_stay
    ), '[]'::jsonb),
    'top_locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'company_name', company_name,
        'bookings', bookings, 'revenue', revenue, 'vehicle_days', vehicle_days
      ) order by revenue desc)
      from top_locations
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

comment on function public.manager_dashboard_overview(timestamptz, timestamptz) is
  'Resumo do dashboard do Manager no período (eixo check-in), com período anterior para comparar, quebra por destino, distribuição de permanência e top unidades. Só hub_admin.';

-- Revoke também de `anon` explicitamente: o grant default do schema public dá
-- EXECUTE a anon em toda função nova, e o `revoke from public` não tira esse.
revoke all on function public.manager_dashboard_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.manager_dashboard_overview(timestamptz, timestamptz) to authenticated, service_role;

-- Fluxo horário do dia: entradas e saídas, por hora local da unidade.
create or replace function public.manager_daily_flow(p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_lo timestamptz;
  v_hi timestamptz;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para o fluxo diário.' using errcode = '42501';
  end if;

  -- Margem de 2 dias em UTC cobre qualquer fuso da unidade sem varrer a tabela toda.
  v_lo := (p_date - 2)::timestamptz;
  v_hi := (p_date + 2)::timestamptz;

  with hours as (select generate_series(0, 23) as hour),
  entries as (
    select
      extract(hour from (bk.check_in_at at time zone l.timezone))::int as hour,
      count(*)::int as vehicles,
      coalesce(sum(bk.passenger_count), 0)::int as passengers,
      count(*) filter (where bk.has_pcd)::int as pcd
    from public.booking bk
    join public.location l on l.id = bk.location_id
    where bk.deleted_at is null
      and bk.status in ('confirmed', 'checked_in', 'completed')
      and bk.check_in_at >= v_lo
      and bk.check_in_at < v_hi
      and (bk.check_in_at at time zone l.timezone)::date = p_date
    group by 1
  ),
  exits as (
    select
      extract(hour from (bk.check_out_at at time zone l.timezone))::int as hour,
      count(*)::int as vehicles,
      coalesce(sum(bk.passenger_count), 0)::int as passengers,
      count(*) filter (where bk.has_pcd)::int as pcd
    from public.booking bk
    join public.location l on l.id = bk.location_id
    where bk.deleted_at is null
      and bk.status in ('confirmed', 'checked_in', 'completed')
      and bk.check_out_at >= v_lo
      and bk.check_out_at < v_hi
      and (bk.check_out_at at time zone l.timezone)::date = p_date
    group by 1
  )
  select jsonb_build_object(
    'date', p_date,
    'entries', (
      select jsonb_agg(jsonb_build_object(
        'hour', h.hour,
        'vehicles', coalesce(e.vehicles, 0),
        'passengers', coalesce(e.passengers, 0),
        'pcd', coalesce(e.pcd, 0)
      ) order by h.hour)
      from hours h left join entries e on e.hour = h.hour
    ),
    'exits', (
      select jsonb_agg(jsonb_build_object(
        'hour', h.hour,
        'vehicles', coalesce(x.vehicles, 0),
        'passengers', coalesce(x.passengers, 0),
        'pcd', coalesce(x.pcd, 0)
      ) order by h.hour)
      from hours h left join exits x on x.hour = h.hour
    )
  ) into v_result;

  return v_result;
end;
$function$;

comment on function public.manager_daily_flow(date) is
  'Fluxo de veículos por hora (entradas e saídas) num dia, com passageiros e PCDs, no fuso de cada unidade. Só hub_admin.';

revoke all on function public.manager_daily_flow(date) from public, anon;
grant execute on function public.manager_daily_flow(date) to authenticated, service_role;
