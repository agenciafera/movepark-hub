-- E1.4.1 — Edição de preço pelo parceiro na extranet. As tabelas pricing_rule/pricing_tier têm RLS
-- só de leitura (escrita era 403 para o operador). RPC SECURITY DEFINER que valida a posse via
-- company e grava a regra + tiers de uma vez (mesmo padrão do onboarding_set_pricing).
-- E1.4.2 — Bloqueio de datas: coluna `blocked` em location_parking_availability + RPC para o operador
-- bloquear/desbloquear, e o motor de reserva (_create_booking_core) rejeita datas bloqueadas.

-- ───────────────────────────────────────────────────────────────────────────
-- E1.4.1 · operator_set_pricing
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.operator_set_pricing(
  p_location_parking_type_id uuid,
  p_base_price numeric,
  p_rule jsonb,
  p_tiers jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_cpt_id uuid;
  v_rule_id uuid;
  rec jsonb;
begin
  select l.company_id, lpt.company_parking_type_id
    into v_company_id, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = p_location_parking_type_id;
  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin() and v_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão para editar este preço.' using errcode = '42501';
  end if;

  if p_base_price is not null then
    update public.company_parking_type set base_price = p_base_price where id = v_cpt_id;
  end if;

  insert into public.pricing_rule (
    location_parking_type_id, strategy, fractional_day_policy, fractional_day_tolerance,
    old_price_strategy, old_price_multiplier, advance_booking_minutes,
    incremental_one_day_price, incremental_two_days_price, incremental_base, incremental_multiplier,
    monthly_fixed_price, monthly_daily_rate,
    hourly_initial_rate, hourly_one_hour_rate, hourly_fraction_rate, hourly_daily_rate, hourly_hours_per_day,
    surcharge_source_id, surcharge_multiplier
  ) values (
    p_location_parking_type_id,
    coalesce(p_rule->>'strategy', 'uniform_by_duration'),
    coalesce(p_rule->>'fractional_day_policy', 'any_extra'),
    (p_rule->>'fractional_day_tolerance')::numeric,
    coalesce(p_rule->>'old_price_strategy', 'none'),
    (p_rule->>'old_price_multiplier')::numeric,
    (p_rule->>'advance_booking_minutes')::int,
    (p_rule->>'incremental_one_day_price')::numeric,
    (p_rule->>'incremental_two_days_price')::numeric,
    (p_rule->>'incremental_base')::numeric,
    (p_rule->>'incremental_multiplier')::numeric,
    (p_rule->>'monthly_fixed_price')::numeric,
    (p_rule->>'monthly_daily_rate')::numeric,
    (p_rule->>'hourly_initial_rate')::numeric,
    (p_rule->>'hourly_one_hour_rate')::numeric,
    (p_rule->>'hourly_fraction_rate')::numeric,
    (p_rule->>'hourly_daily_rate')::numeric,
    (p_rule->>'hourly_hours_per_day')::int,
    nullif(p_rule->>'surcharge_source_id', '')::uuid,
    (p_rule->>'surcharge_multiplier')::numeric
  )
  on conflict (location_parking_type_id) do update set
    strategy = excluded.strategy,
    fractional_day_policy = excluded.fractional_day_policy,
    fractional_day_tolerance = excluded.fractional_day_tolerance,
    old_price_strategy = excluded.old_price_strategy,
    old_price_multiplier = excluded.old_price_multiplier,
    advance_booking_minutes = excluded.advance_booking_minutes,
    incremental_one_day_price = excluded.incremental_one_day_price,
    incremental_two_days_price = excluded.incremental_two_days_price,
    incremental_base = excluded.incremental_base,
    incremental_multiplier = excluded.incremental_multiplier,
    monthly_fixed_price = excluded.monthly_fixed_price,
    monthly_daily_rate = excluded.monthly_daily_rate,
    hourly_initial_rate = excluded.hourly_initial_rate,
    hourly_one_hour_rate = excluded.hourly_one_hour_rate,
    hourly_fraction_rate = excluded.hourly_fraction_rate,
    hourly_daily_rate = excluded.hourly_daily_rate,
    hourly_hours_per_day = excluded.hourly_hours_per_day,
    surcharge_source_id = excluded.surcharge_source_id,
    surcharge_multiplier = excluded.surcharge_multiplier
  returning id into v_rule_id;

  -- substitui as faixas (mantém as is_old_price, geradas pelo motor)
  delete from public.pricing_tier where pricing_rule_id = v_rule_id and is_old_price = false;
  for rec in select value from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
    values (v_rule_id, coalesce((rec->>'from_day')::int, 1), (rec->>'to_day')::int,
      (rec->>'unit_price')::numeric, (rec->>'total_price')::numeric, false);
  end loop;
end;
$$;

revoke all on function public.operator_set_pricing(uuid, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.operator_set_pricing(uuid, numeric, jsonb, jsonb) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- E1.4.2 · bloqueio de datas
-- ───────────────────────────────────────────────────────────────────────────
alter table public.location_parking_availability
  add column if not exists blocked boolean not null default false;

-- Operador bloqueia/desbloqueia uma data da sua unidade (escrita só via esta RPC).
create or replace function public.operator_set_date_blocked(
  p_location_parking_type_id uuid,
  p_date date,
  p_blocked boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company_id uuid;
begin
  select l.company_id into v_company_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = p_location_parking_type_id;
  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin() and v_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão para bloquear datas desta unidade.' using errcode = '42501';
  end if;

  insert into public.location_parking_availability (location_parking_type_id, date, booked_count, blocked)
  values (p_location_parking_type_id, p_date, 0, p_blocked)
  on conflict (location_parking_type_id, date) do update set blocked = excluded.blocked;
end;
$$;

revoke all on function public.operator_set_date_blocked(uuid, date, boolean) from public, anon;
grant execute on function public.operator_set_date_blocked(uuid, date, boolean) to authenticated, service_role;

-- Ocupação por data agora também devolve `blocked` (p/ a grade do operador exibir/alternar).
-- DROP necessário: mudar o tipo de retorno (nova coluna) não é permitido em CREATE OR REPLACE.
drop function if exists public.operator_location_occupancy(uuid, date, date);
create or replace function public.operator_location_occupancy(
  p_location_id uuid,
  p_from date,
  p_to date
) returns table(
  location_parking_type_id uuid,
  parking_type_name text,
  date date,
  capacity integer,
  booked_count integer,
  blocked boolean
) language plpgsql stable security definer set search_path to 'public' as $foo$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.location where id = p_location_id and deleted_at is null;
  if v_company_id is null then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin()
     and not exists (select 1 from public.profile_company where profile_id = auth.uid() and company_id = v_company_id) then
    raise exception 'Sem permissão para ver a ocupação desta unidade.' using errcode = '42501';
  end if;

  return query
    select lpt.id, pt.name, d.date::date, lpt.capacity, coalesce(a.booked_count, 0), coalesce(a.blocked, false)
    from public.location_parking_type lpt
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    cross join generate_series(p_from, p_to, '1 day') d(date)
    left join public.location_parking_availability a
      on a.location_parking_type_id = lpt.id and a.date = d.date::date
    where lpt.location_id = p_location_id and lpt.is_active
    order by pt.name, d.date;
end; $foo$;

revoke all on function public.operator_location_occupancy(uuid, date, date) from public;
grant all on function public.operator_location_occupancy(uuid, date, date) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- _create_booking_core: rejeita datas bloqueadas (mantém todo o resto da E2.2.1).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._create_booking_core(
  p_profile_id uuid,
  p_created_via_api_key_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_passenger_count integer,
  p_has_pcd boolean,
  p_vehicle_id uuid,
  p_add_on_ids uuid[],
  p_coupon_code text,
  p_origin text
) returns jsonb language plpgsql security definer set search_path to 'public' as $core$
declare
  v_lpt_id uuid; v_lpt_capacity int; v_lpt_active boolean;
  v_location_id uuid; v_location_slug text; v_company_slug text;
  v_parking_type_id uuid; v_parking_type_code text; v_cpt_id uuid;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes int; v_date date; v_booked int; v_blocked boolean;
  v_sim jsonb; v_price numeric; v_base numeric; v_old_price numeric; v_subtotal numeric;
  v_code text; v_booking_id uuid; v_expires_at timestamptz;
  v_add_on_id uuid; v_add_on_name text; v_add_on_price numeric;
  v_coupon_id uuid; v_discount numeric := 0; v_total numeric;
  v_line_items jsonb := '[]'::jsonb; v_eval record;
  v_auto_rule uuid; v_auto_discount numeric := 0; v_auto_stack boolean := true; v_disc record;
  v_breakdown jsonb;
begin
  select lpt.id, lpt.capacity, lpt.is_active,
         l.id, l.slug, c.slug, pt.id, pt.code, cpt.id,
         lpt.has_minimum_stay, lpt.minimum_stay_value, lpt.minimum_stay_unit,
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes
    into v_lpt_id, v_lpt_capacity, v_lpt_active,
         v_location_id, v_location_slug, v_company_slug, v_parking_type_id, v_parking_type_code, v_cpt_id,
         v_has_min_stay, v_min_stay_value, v_min_stay_unit,
         v_has_min_date, v_min_date, v_advance_min
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where lpt.id = p_location_parking_type_id and l.deleted_at is null;

  if v_lpt_id is null then raise exception 'Tipo de vaga não encontrado' using errcode = 'P0001'; end if;
  if not v_lpt_active then raise exception 'Tipo de vaga desativado' using errcode = 'P0001'; end if;
  if p_check_out_at <= p_check_in_at then
    raise exception 'Check-out precisa ser após o check-in' using errcode = 'P0001';
  end if;

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_total_minutes::numeric / (60 * 24))::int);

  if v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
    raise exception 'Estadia mínima não atingida para essa vaga.' using errcode = 'P0001';
  end if;
  if v_has_min_date and v_min_date is not null and p_check_in_at::date < v_min_date then
    raise exception 'Data de entrada antes da data mínima permitida.' using errcode = 'P0001';
  end if;
  if v_advance_min is not null and p_check_in_at < now() + (v_advance_min || ' minutes')::interval then
    raise exception 'Reserva exige antecedência mínima.' using errcode = 'P0001';
  end if;

  for v_date in
    select generate_series(p_check_in_at::date, (p_check_out_at - interval '1 microsecond')::date, '1 day')::date
  loop
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0) on conflict (location_parking_type_id, date) do nothing;
    select booked_count, blocked into v_booked, v_blocked from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date for update;
    if v_blocked then
      raise exception 'Data % indisponível (bloqueada pelo estacionamento).', v_date using errcode = 'P0001';
    end if;
    if v_booked >= v_lpt_capacity then
      raise exception 'Sem disponibilidade para %', v_date using errcode = 'P0001';
    end if;
    update public.location_parking_availability set booked_count = booked_count + 1
    where location_parking_type_id = v_lpt_id and date = v_date;
  end loop;

  v_sim := public.simulate_price(v_company_slug, v_location_slug, v_parking_type_code, v_days);
  v_price := (v_sim ->> 'price')::numeric;
  v_base := coalesce(nullif(v_sim ->> 'base_price', '')::numeric, v_price);
  v_old_price := nullif(v_sim ->> 'old_price', '')::numeric;

  if v_base is null then
    raise exception 'Preço indisponível para essa configuração' using errcode = 'P0001';
  end if;

  for v_disc in
    select * from public.discount_evaluate(v_location_id, v_cpt_id, v_base, v_days, p_check_in_at)
  loop
    v_auto_rule := v_disc.discount_rule_id;
    v_auto_discount := coalesce(v_disc.discount, 0);
    v_auto_stack := coalesce(v_disc.allow_coupon_stack, true);
  end loop;

  v_subtotal := v_base - v_auto_discount;
  if v_auto_discount > 0 then v_old_price := v_base; end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    if v_auto_rule is not null and not v_auto_stack then
      raise exception 'Este cupom não acumula com a promoção em vigor.' using errcode = 'P0001';
    end if;
    select * into v_eval from public.coupon_evaluate(
      trim(p_coupon_code), v_location_id, p_profile_id, v_subtotal, v_days, v_cpt_id);
    if v_eval.error_code is not null then
      raise exception 'Cupom inválido ou expirado' using errcode = 'P0001';
    end if;
    v_coupon_id := v_eval.coupon_id;
    v_discount := coalesce(v_eval.discount, 0);
  end if;

  v_code := 'MP-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 6));
  v_expires_at := now() + interval '30 minutes';
  v_total := v_subtotal - v_discount;

  insert into public.booking (
    code, profile_id, location_id, vehicle_id, check_in_at, check_out_at,
    total_amount, currency, passenger_count, has_pcd, origin, status, expires_at,
    created_via_api_key_id, customer_name, customer_email, customer_phone
  ) values (
    v_code, p_profile_id, v_location_id, p_vehicle_id, p_check_in_at, p_check_out_at,
    v_total, 'BRL', p_passenger_count, p_has_pcd, p_origin, 'pending', v_expires_at,
    p_created_via_api_key_id, p_customer_name, p_customer_email, p_customer_phone
  ) returning id into v_booking_id;

  insert into public.booking_item (booking_id, item_type, parking_type_id, quantity, unit_price, subtotal)
  values (v_booking_id, 'parking', v_parking_type_id, 1, v_subtotal, v_subtotal);

  v_line_items := v_line_items || jsonb_build_object(
    'kind', 'parking', 'name', v_parking_type_code, 'quantity', 1,
    'unit_price', v_subtotal, 'subtotal', v_subtotal);

  if v_auto_rule is not null and v_auto_discount > 0 then
    insert into public.booking_discount (booking_id, discount_rule_id, discount_applied)
    values (v_booking_id, v_auto_rule, v_auto_discount);
  end if;

  if p_add_on_ids is not null and array_length(p_add_on_ids, 1) > 0 then
    foreach v_add_on_id in array p_add_on_ids loop
      select a.name, coalesce(las.price_override, a.base_price) into v_add_on_name, v_add_on_price
      from public.add_on_service a
      join public.location_add_on_service las on las.add_on_service_id = a.id
      where a.id = v_add_on_id and a.is_active = true
        and las.location_id = v_location_id and las.is_active = true;
      if v_add_on_name is not null then
        insert into public.booking_item (booking_id, item_type, add_on_service_id, quantity, unit_price, subtotal)
        values (v_booking_id, 'add_on', v_add_on_id, 1, v_add_on_price, v_add_on_price);
        update public.booking set total_amount = total_amount + v_add_on_price where id = v_booking_id;
        v_total := v_total + v_add_on_price;
        v_line_items := v_line_items || jsonb_build_object(
          'kind', 'add_on', 'name', v_add_on_name, 'quantity', 1,
          'unit_price', v_add_on_price, 'subtotal', v_add_on_price);
      end if;
    end loop;
  end if;

  if v_coupon_id is not null and v_discount > 0 then
    insert into public.booking_coupon (booking_id, coupon_id, discount_applied)
    values (v_booking_id, v_coupon_id, v_discount);
  end if;

  v_breakdown := jsonb_build_object(
    'currency', 'BRL',
    'days', v_days,
    'strategy', v_sim ->> 'strategy',
    'base_price', v_base,
    'old_price', v_old_price,
    'subtotal', v_subtotal,
    'auto_discount', case when v_auto_discount > 0
      then jsonb_build_object('amount', v_auto_discount, 'rule_id', v_auto_rule,
                              'label', v_sim -> 'discount' ->> 'label')
      else null end,
    'coupon', case when v_coupon_id is not null and v_discount > 0
      then jsonb_build_object('code', upper(trim(p_coupon_code)), 'discount', v_discount)
      else null end,
    'total', v_total,
    'line_items', v_line_items);
  update public.booking set price_breakdown = v_breakdown where id = v_booking_id;

  return jsonb_build_object(
    'code', v_code, 'booking_id', v_booking_id, 'total_amount', v_total,
    'subtotal', v_subtotal, 'base_price', v_base,
    'discount', v_discount, 'auto_discount', v_auto_discount,
    'old_price', v_old_price, 'days', v_days, 'expires_at', v_expires_at,
    'line_items', v_line_items, 'price_breakdown', v_breakdown);
end; $core$;
