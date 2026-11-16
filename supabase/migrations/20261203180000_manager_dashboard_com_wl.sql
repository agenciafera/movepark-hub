-- Dashboard do Manager com o white-label nos cards analíticos (16/11/2026).
--
-- Filtrado por uma unidade que vende pelo site, o Manager mostrava a receita e mais nada: leitura
-- do período, rede com receita, concentração, ticket, permanência, ranking, clientes, destino e
-- fluxo por hora liam só `booking` (Hub). As duas RPCs ganham `p_source` ('hub' | 'wl' | 'all',
-- padrão 'hub', que é o comportamento de antes) e passam a juntar as linhas de `wl_booking` no
-- mesmo formato das do Hub.
--
-- Regras da linha do site (as mesmas do card de receita, `wl_revenue`):
-- - Valor: `paid_total_cents`. Venda: `status = 'confirmed'`, fora as duplicadas (`is_duplicate`).
-- - Status: no vocabulário do Hub, por `wl_booking_hub_status` (a mesma tradução da lista).
-- - Cliente novo ou recorrente: 40% das reservas do site não têm e-mail, então a chave do site é
--   o e-mail ou, sem ele, os dígitos do telefone. Com o site no recorte, a chave do Hub passa a
--   ser o e-mail (antes o perfil), para o mesmo cliente casar entre as duas origens. Com só o Hub,
--   continua perfil e depois e-mail, como antes.
-- - Comissão e repasse (`money`) seguem só do Hub: o dinheiro do site cai direto na conta do
--   estacionamento. Tarifa só existe no Hub.
-- - `current` ganha a quebra por origem (`hub_*`, `wl_*`) para o card de receita não somar o site
--   duas vezes.
--
-- A assinatura muda (parâmetro novo), então é drop + create, com os grants de antes:
-- authenticated e service_role, nada para anon nem public. As duas continuam só de hub_admin.

-- Índices para a linha do site por unidade e data (base do dashboard e do fluxo por hora).
create index if not exists wl_booking_location_checkin_idx
  on public.wl_booking (location_id, check_in_at);
create index if not exists wl_booking_location_checkout_idx
  on public.wl_booking (location_id, check_out_at);

drop function if exists public.manager_dashboard_overview(timestamptz, timestamptz, timestamptz, timestamptz, uuid[]);

create function public.manager_dashboard_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_compare_from timestamptz default null,
  p_compare_to timestamptz default null,
  p_location_ids uuid[] default null,
  p_source text default 'hub'
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_span interval;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_locs uuid[];
  v_hub boolean;
  v_wl boolean;
  v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para o dashboard do Manager.' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('hub', 'wl', 'all') then
    raise exception 'Origem inválida: use hub, wl ou all.' using errcode = '22023';
  end if;

  v_span := p_to - p_from;
  v_prev_from := coalesce(p_compare_from, p_from - v_span);
  v_prev_to := coalesce(p_compare_to, p_from);
  v_locs := nullif(p_location_ids, '{}'::uuid[]);
  v_hub := p_source in ('hub', 'all');
  v_wl := p_source in ('wl', 'all');

  with base as (
    select
      'hub'::text as origem,
      bk.id,
      bk.status::text as status,
      bk.total_amount,
      bk.fare_price_cents,
      bk.fare_tier::text as fare_tier,
      coalesce(bk.passenger_count, 0) as passenger_count,
      bk.has_pcd,
      bk.created_at,
      bk.check_in_at,
      case when p_source = 'hub'
        then coalesce(bk.profile_id::text, lower(bk.customer_email))
        else coalesce(lower(nullif(btrim(bk.customer_email), '')), bk.profile_id::text)
      end as cliente,
      bk.location_id,
      ((bk.check_out_at - interval '1 microsecond')::date - bk.check_in_at::date) + 1 as stay_days,
      bk.status in ('confirmed', 'checked_in', 'completed') as is_paid
    from public.booking bk
    where v_hub
      and bk.deleted_at is null
      and (v_locs is null or bk.location_id = any(v_locs))
      and (
        (bk.check_in_at >= p_from and bk.check_in_at < p_to)
        or (bk.check_in_at >= v_prev_from and bk.check_in_at < v_prev_to)
      )
    union all
    select
      'wl'::text,
      w.id,
      public.wl_booking_hub_status(w.status, w.attendance_status, w.check_out_at),
      coalesce(w.paid_total_cents, 0) / 100.0,
      null::integer,
      null::text,
      coalesce(w.passenger_count, 0),
      coalesce(w.has_pcd, false),
      w.wl_created_at,
      w.check_in_at,
      coalesce(
        lower(nullif(btrim(w.customer_email), '')),
        nullif(regexp_replace(coalesce(w.customer_phone, ''), '\D', '', 'g'), '')
      ),
      w.location_id,
      ((w.check_out_at - interval '1 microsecond')::date - w.check_in_at::date) + 1,
      w.status = 'confirmed' and not coalesce(w.is_duplicate, false)
    from public.wl_booking w
    where v_wl
      and w.location_id is not null
      and (v_locs is null or w.location_id = any(v_locs))
      and (
        (w.check_in_at >= p_from and w.check_in_at < p_to)
        or (w.check_in_at >= v_prev_from and w.check_in_at < v_prev_to)
      )
  ),
  cur as (
    select * from base where check_in_at >= p_from and check_in_at < p_to
  ),
  cur_paid as (select * from cur where is_paid),
  prev_paid as (
    select * from base
    where check_in_at >= v_prev_from and check_in_at < v_prev_to and is_paid
  ),
  scoped_locations as (
    select l.id, l.name, co.name as company_name
    from public.location l
    join public.company co on co.id = l.company_id
    where l.deleted_at is null
      and l.status = 'active'
      and (v_locs is null or l.id = any(v_locs))
  ),
  -- Primeira compra paga de cada cliente, nas origens do recorte, com a mesma chave da linha.
  historico as (
    select
      case when p_source = 'hub'
        then coalesce(b2.profile_id::text, lower(b2.customer_email))
        else coalesce(lower(nullif(btrim(b2.customer_email), '')), b2.profile_id::text)
      end as cliente,
      b2.created_at as at
    from public.booking b2
    where v_hub
      and b2.deleted_at is null
      and b2.status in ('confirmed', 'checked_in', 'completed')
    union all
    select
      coalesce(
        lower(nullif(btrim(w2.customer_email), '')),
        nullif(regexp_replace(coalesce(w2.customer_phone, ''), '\D', '', 'g'), '')
      ),
      w2.wl_created_at
    from public.wl_booking w2
    where v_wl
      and w2.status = 'confirmed'
      and not coalesce(w2.is_duplicate, false)
  ),
  primeira as (
    select cliente, min(at) as at from historico where cliente is not null group by cliente
  ),
  customers as (
    select
      count(*) filter (where c.created_at <= p.at) as new_customers,
      count(*) filter (where c.created_at > p.at) as returning_customers
    from cur_paid c
    join primeira p on p.cliente = c.cliente
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
  by_fare as (
    select
      fare_tier,
      count(*)::int as bookings,
      coalesce(sum(fare_price_cents), 0) / 100.0 as revenue
    from cur_paid
    where fare_tier is not null
    group by 1
  ),
  ranking as (
    select
      sl.id,
      sl.name,
      sl.company_name,
      count(c.id)::int as bookings,
      coalesce(sum(c.total_amount), 0) as revenue,
      coalesce(sum(c.stay_days), 0)::int as vehicle_days
    from scoped_locations sl
    left join cur_paid c on c.location_id = sl.id
    group by 1, 2, 3
    order by 5 desc, 4 desc, 2
    limit 12
  )
  select jsonb_build_object(
    'source', p_source,
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
        'fare_revenue', coalesce(sum(fare_price_cents), 0) / 100.0,
        'hub_bookings', count(*) filter (where origem = 'hub'),
        'hub_revenue', coalesce(sum(total_amount) filter (where origem = 'hub'), 0),
        'hub_vehicle_days', coalesce(sum(stay_days) filter (where origem = 'hub'), 0),
        'wl_bookings', count(*) filter (where origem = 'wl'),
        'wl_revenue', coalesce(sum(total_amount) filter (where origem = 'wl'), 0)
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
    'network', jsonb_build_object(
      'locations_total', (select count(*)::int from scoped_locations),
      'locations_with_revenue', (
        select count(*)::int from (
          select c.location_id from cur_paid c group by c.location_id having sum(c.total_amount) > 0
        ) t
      )
    ),
    -- Só a venda do Hub passa pelo caixa da Movepark.
    'money', (
      select jsonb_build_object(
        'commission', coalesce(sum(c.total_amount * co.take_rate_bps) / 10000.0, 0),
        'payout', coalesce(sum(c.total_amount), 0)
                  - coalesce(sum(c.total_amount * co.take_rate_bps) / 10000.0, 0)
      )
      from cur_paid c
      join public.location l on l.id = c.location_id
      join public.company co on co.id = l.company_id
      where c.origem = 'hub'
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
    'by_fare', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tier', fare_tier, 'bookings', bookings, 'revenue', revenue
      ) order by revenue desc)
      from by_fare
    ), '[]'::jsonb),
    'top_locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'company_name', company_name,
        'bookings', bookings, 'revenue', revenue, 'vehicle_days', vehicle_days
      ) order by revenue desc, bookings desc, name)
      from ranking
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.manager_dashboard_overview(timestamptz, timestamptz, timestamptz, timestamptz, uuid[], text) from public, anon;
grant execute on function public.manager_dashboard_overview(timestamptz, timestamptz, timestamptz, timestamptz, uuid[], text) to authenticated, service_role;

drop function if exists public.manager_daily_flow(date, uuid[]);

create function public.manager_daily_flow(
  p_date date,
  p_location_ids uuid[] default null,
  p_source text default 'hub'
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_lo timestamptz;
  v_hi timestamptz;
  v_locs uuid[];
  v_hub boolean;
  v_wl boolean;
begin
  if not public.is_hub_admin() then
    raise exception 'Sem permissão para o fluxo diário.' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('hub', 'wl', 'all') then
    raise exception 'Origem inválida: use hub, wl ou all.' using errcode = '22023';
  end if;

  v_lo := (p_date - 2)::timestamptz;
  v_hi := (p_date + 2)::timestamptz;
  v_locs := nullif(p_location_ids, '{}'::uuid[]);
  v_hub := p_source in ('hub', 'all');
  v_wl := p_source in ('wl', 'all');

  with hours as (select generate_series(0, 23) as hour),
  -- Carros pagos das origens do recorte, com a entrada e a saída no fuso da unidade.
  carros as (
    select bk.check_in_at as entrada, bk.check_out_at as saida, l.timezone,
           coalesce(bk.passenger_count, 0) as passageiros, bk.has_pcd as pcd
    from public.booking bk
    join public.location l on l.id = bk.location_id
    where v_hub
      and bk.deleted_at is null
      and bk.status in ('confirmed', 'checked_in', 'completed')
      and (v_locs is null or bk.location_id = any(v_locs))
      and ((bk.check_in_at >= v_lo and bk.check_in_at < v_hi)
           or (bk.check_out_at >= v_lo and bk.check_out_at < v_hi))
    union all
    select w.check_in_at, w.check_out_at, l.timezone,
           coalesce(w.passenger_count, 0), coalesce(w.has_pcd, false)
    from public.wl_booking w
    join public.location l on l.id = w.location_id
    where v_wl
      and w.status = 'confirmed'
      and not coalesce(w.is_duplicate, false)
      and (v_locs is null or w.location_id = any(v_locs))
      and ((w.check_in_at >= v_lo and w.check_in_at < v_hi)
           or (w.check_out_at >= v_lo and w.check_out_at < v_hi))
  ),
  entries as (
    select
      extract(hour from (c.entrada at time zone c.timezone))::int as hour,
      count(*)::int as vehicles,
      coalesce(sum(c.passageiros), 0)::int as passengers,
      count(*) filter (where c.pcd)::int as pcd
    from carros c
    where c.entrada >= v_lo and c.entrada < v_hi
      and (c.entrada at time zone c.timezone)::date = p_date
    group by 1
  ),
  exits as (
    select
      extract(hour from (c.saida at time zone c.timezone))::int as hour,
      count(*)::int as vehicles,
      coalesce(sum(c.passageiros), 0)::int as passengers,
      count(*) filter (where c.pcd)::int as pcd
    from carros c
    where c.saida >= v_lo and c.saida < v_hi
      and (c.saida at time zone c.timezone)::date = p_date
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

revoke all on function public.manager_daily_flow(date, uuid[], text) from public, anon;
grant execute on function public.manager_daily_flow(date, uuid[], text) to authenticated, service_role;
