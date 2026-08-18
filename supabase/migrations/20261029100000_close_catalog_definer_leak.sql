-- Fecha o vazamento de disponibilidade/preço de empresa/unidade fora do catálogo público.
--
-- check_availability, get_pricing_data, availability_batch e simulate_price são
-- `security definer`, executáveis por `anon` (a vitrine e o checkout dependem disso), e por
-- serem definer IGNORAM a RLS de `company`/`location` (catalog_read_company/catalog_read_location:
-- deleted_at is null and status = 'active' and (is_listed | onboarding_status = 'active')).
-- Confirmado em produção: 9 unidades de empresas inactive/suspended continuam com
-- location.status='active' e is_listed=true (elas só saem por não aparecerem na busca/sitemap,
-- que filtram certo). Quem já tem a URL de checkout (/p/<company>/<location>/<tipo>) chama essas
-- RPCs direto via /rest/v1/rpc e recebe disponibilidade e preço reais de empresa fora do ar.
--
-- Reaplica aqui, dentro de cada função, o mesmo predicado da RLS que elas contornam.
-- get_unit_fares fica de fora de propósito: não recebe company/location no filtro (o parâmetro
-- p_location_parking_type_id nem é usado na query), é catálogo global de Tarifas, não dado
-- por unidade.

create or replace function public.check_availability(
  p_company text, p_location text, p_parking_type text,
  p_check_in_at timestamptz, p_check_out_at timestamptz
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_lpt_id uuid; v_capacity int; v_active boolean;
  v_near_threshold int; v_near_message text;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_total_minutes numeric; v_days int; v_max_booked int; v_remaining int;
  v_min_stay_ok boolean; v_min_date_ok boolean; v_advance_ok boolean; v_past_ok boolean;
  v_sold_out boolean; v_near boolean; v_ok boolean;
  v_reasons text[] := '{}';
begin
  if p_check_in_at is null or p_check_out_at is null or p_check_out_at <= p_check_in_at then
    return jsonb_build_object('error', 'Período inválido');
  end if;

  select lpt.id, lpt.capacity, lpt.is_active,
         lpt.near_capacity_threshold, lpt.near_capacity_message,
         lpt.has_minimum_stay, lpt.minimum_stay_value, lpt.minimum_stay_unit,
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes
    into v_lpt_id, v_capacity, v_active,
         v_near_threshold, v_near_message,
         v_has_min_stay, v_min_stay_value, v_min_stay_unit,
         v_has_min_date, v_min_date, v_advance_min
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where c.slug = p_company and l.slug = p_location and pt.code = p_parking_type
    and l.deleted_at is null and l.status = 'active'::entity_status and l.is_listed
    and c.deleted_at is null and c.status = 'active'::entity_status
    and c.onboarding_status = 'active'::onboarding_status
  limit 1;

  if v_lpt_id is null then
    return jsonb_build_object('error',
      format('Tipo de vaga não encontrado: %s / %s / %s', p_company, p_location, p_parking_type));
  end if;

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_total_minutes / (60 * 24))::int);

  select coalesce(max(a.booked_count + coalesce(a.external_booked_count, 0)), 0) into v_max_booked
  from generate_series(p_check_in_at::date, (p_check_out_at - interval '1 microsecond')::date, '1 day') d(date)
  left join public.location_parking_availability a
    on a.location_parking_type_id = v_lpt_id and a.date = d.date::date;

  v_remaining := v_capacity - v_max_booked;
  v_sold_out  := (not v_active) or v_remaining <= 0;
  v_near      := v_near_threshold is not null and v_remaining > 0 and v_remaining <= v_near_threshold;

  v_min_stay_ok := (not v_has_min_stay)
    or public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days);
  v_min_date_ok := (not v_has_min_date) or v_min_date is null or p_check_in_at::date >= v_min_date;
  v_advance_ok  := v_advance_min is null
    or p_check_in_at >= now() + (v_advance_min || ' minutes')::interval;
  v_past_ok     := not public.check_in_in_past(p_check_in_at);

  if v_sold_out      then v_reasons := array_append(v_reasons, 'sold_out'); end if;
  if not v_min_stay_ok then v_reasons := array_append(v_reasons, 'min_stay'); end if;
  if not v_min_date_ok then v_reasons := array_append(v_reasons, 'min_date'); end if;
  if not v_advance_ok  then v_reasons := array_append(v_reasons, 'advance'); end if;
  if not v_past_ok     then v_reasons := array_append(v_reasons, 'past'); end if;

  v_ok := not v_sold_out and v_min_stay_ok and v_min_date_ok and v_advance_ok and v_past_ok;

  return jsonb_build_object(
    'ok',                  v_ok,
    'capacity',            v_capacity,
    'remaining',           greatest(0, v_remaining),
    'sold_out',            v_sold_out,
    'near_capacity',       v_near,
    'near_capacity_message', v_near_message,
    'min_stay_ok',         v_min_stay_ok,
    'min_stay_value',      v_min_stay_value,
    'min_stay_unit',       v_min_stay_unit,
    'min_date_ok',         v_min_date_ok,
    'minimum_date',        v_min_date,
    'advance_ok',          v_advance_ok,
    'advance_minutes',     v_advance_min,
    'past_ok',             v_past_ok,
    'days',                v_days,
    'reasons',             to_jsonb(v_reasons));
end; $function$;

create or replace function public.get_pricing_data(
  p_company text, p_location text default null::text, p_parking_type text default null::text
)
returns table(
  company_name text, company_slug text, location_slug text, location_name text,
  parking_type_code text, parking_type_name text,
  strategy text, old_price_strategy text, old_price_multiplier double precision,
  surcharge_multiplier double precision, source_strategy text,
  incremental_one_day_price double precision, incremental_two_days_price double precision,
  incremental_base double precision, incremental_multiplier double precision,
  monthly_fixed_price double precision, monthly_daily_rate double precision,
  hourly_daily_rate double precision, hourly_hours_per_day integer,
  tiers jsonb, source_tiers jsonb
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    c.name, c.slug, l.slug, l.name,
    pt.code, pt.name,
    pr.strategy,
    pr.old_price_strategy,
    pr.old_price_multiplier::float8,
    pr.surcharge_multiplier::float8,
    src_pr.strategy as source_strategy,
    pr.incremental_one_day_price::float8,
    pr.incremental_two_days_price::float8,
    pr.incremental_base::float8,
    pr.incremental_multiplier::float8,
    pr.monthly_fixed_price::float8,
    pr.monthly_daily_rate::float8,
    pr.hourly_daily_rate::float8,
    pr.hourly_hours_per_day,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'from_day',    t.from_day,
          'to_day',      t.to_day,
          'unit_price',  t.unit_price::float8,
          'total_price', t.total_price::float8,
          'is_old_price', t.is_old_price
        ) order by t.from_day, t.is_old_price::int
      )
      from pricing_tier t
      where t.pricing_rule_id = pr.id
    ), '[]'::jsonb) as tiers,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'from_day',    st.from_day,
          'to_day',      st.to_day,
          'unit_price',  st.unit_price::float8,
          'total_price', st.total_price::float8,
          'is_old_price', st.is_old_price
        ) order by st.from_day, st.is_old_price::int
      )
      from pricing_tier st
      where st.pricing_rule_id = src_pr.id
    ), '[]'::jsonb) as source_tiers
  from company c
  join location l on l.company_id = c.id and l.deleted_at is null
  join location_parking_type lpt on lpt.location_id = l.id and lpt.is_active = true
  join company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active = true
  join parking_type pt on pt.id = cpt.parking_type_id
  join pricing_rule pr on pr.location_parking_type_id = lpt.id
  left join pricing_rule src_pr on src_pr.location_parking_type_id = pr.surcharge_source_id
  where c.slug = p_company and c.deleted_at is null
    and c.status = 'active'::entity_status and c.onboarding_status = 'active'::onboarding_status
    and l.status = 'active'::entity_status and l.is_listed
    and (p_location is null or l.slug = p_location)
    and (p_parking_type is null or pt.code = p_parking_type)
  order by l.name, pt.name;
$function$;

create or replace function public.availability_batch(
  p_lpt_ids uuid[], p_check_in_at timestamptz, p_check_out_at timestamptz
)
returns table(
  location_parking_type_id uuid, capacity integer, remaining integer,
  sold_out boolean, near_capacity boolean, near_capacity_message text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with dates as (
    select generate_series(p_check_in_at::date, (p_check_out_at - interval '1 microsecond')::date, '1 day')::date as date
  ),
  maxbooked as (
    select lpt.id as lpt_id, lpt.capacity, lpt.is_active, lpt.near_capacity_threshold, lpt.near_capacity_message,
           coalesce(max(a.booked_count + coalesce(a.external_booked_count, 0)), 0) as max_booked
    from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    join public.company c on c.id = l.company_id
    cross join dates d
    left join public.location_parking_availability a on a.location_parking_type_id = lpt.id and a.date = d.date
    where lpt.id = any(p_lpt_ids)
      and l.deleted_at is null and l.status = 'active'::entity_status and l.is_listed
      and c.deleted_at is null and c.status = 'active'::entity_status
      and c.onboarding_status = 'active'::onboarding_status
    group by lpt.id, lpt.capacity, lpt.is_active, lpt.near_capacity_threshold, lpt.near_capacity_message
  )
  select lpt_id, capacity, greatest(0, capacity - max_booked) as remaining,
    (not is_active) or (capacity - max_booked) <= 0 as sold_out,
    (near_capacity_threshold is not null and (capacity - max_booked) > 0 and (capacity - max_booked) <= near_capacity_threshold) as near_capacity,
    near_capacity_message
  from maxbooked;
$function$;

create or replace function public.simulate_price(
  p_company text, p_location text default null::text, p_parking_type text default null::text,
  p_days integer default 1
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_row record; v_price numeric; v_base numeric; v_old_price numeric; v_price_tiers jsonb;
  v_location_id uuid; v_cpt_id uuid; v_disc record; v_disc_obj jsonb := null;
begin
  select * into v_row from public.get_pricing_data(p_company, p_location, p_parking_type) limit 1;
  if not found then
    return jsonb_build_object('error', format('Tipo de vaga não encontrado: %s / %s / %s', p_company, p_location, p_parking_type));
  end if;
  v_price_tiers := coalesce((select jsonb_agg(t order by (t->>'from_day')::int)
     from jsonb_array_elements(v_row.tiers) t where (t->>'is_old_price')::boolean is distinct from true), '[]'::jsonb);
  v_price := public._apply_pricing(v_row.strategy, v_price_tiers, v_row.source_strategy, v_row.source_tiers,
    v_row.surcharge_multiplier, p_days, v_row.incremental_one_day_price, v_row.incremental_two_days_price,
    v_row.incremental_base, v_row.incremental_multiplier, v_row.monthly_fixed_price, v_row.monthly_daily_rate, v_row.hourly_daily_rate);
  v_old_price := case v_row.old_price_strategy
    when 'multiplier' then round(v_price * v_row.old_price_multiplier::numeric, 2)
    when 'own_table' then public._apply_pricing(v_row.strategy,
        coalesce((select jsonb_agg(t order by (t->>'from_day')::int) from jsonb_array_elements(v_row.tiers) t
                  where (t->>'is_old_price')::boolean = true), '[]'::jsonb),
        null, null, null, p_days, null, null, null, null, null, null, null)
    else null end;
  v_base := v_price;
  select l.id, cpt.id into v_location_id, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where c.slug = p_company and l.slug = p_location and pt.code = p_parking_type and lpt.is_active
    and l.deleted_at is null and l.status = 'active'::entity_status and l.is_listed
    and c.deleted_at is null and c.status = 'active'::entity_status
    and c.onboarding_status = 'active'::onboarding_status
  limit 1;
  if v_location_id is not null then
    for v_disc in select * from public.discount_evaluate(v_location_id, v_cpt_id, v_base, p_days, null) loop
      if coalesce(v_disc.discount, 0) > 0 then
        v_price := v_base - v_disc.discount;
        v_old_price := v_base;
        v_disc_obj := jsonb_build_object('rule_id', v_disc.discount_rule_id, 'amount', v_disc.discount, 'label', v_disc.label);
      end if;
    end loop;
  end if;
  return jsonb_build_object(
    'company', v_row.company_name, 'company_slug', v_row.company_slug, 'location', v_row.location_name,
    'location_slug', v_row.location_slug, 'parking_type', v_row.parking_type_name, 'parking_type_code', v_row.parking_type_code,
    'days', p_days, 'base_price', v_base, 'price', v_price, 'old_price', v_old_price,
    'discount', v_disc_obj, 'currency', 'BRL', 'strategy', v_row.strategy);
end; $function$;
