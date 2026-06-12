-- Capacidade real (end-to-end).
-- A infra de hold/release já existe no baseline (location_parking_availability,
-- create_booking_atomic segura por data, release_booking_capacity decrementa).
-- Esta migration fecha as lacunas:
--   1) min_stay_satisfied  — helper puro de estadia mínima
--   2) check_availability  — disponibilidade + regras para o listing (preview por período)
--   3) availability_batch  — disponibilidade em lote para a edge `search`
--   4) create_booking_atomic — passa a aplicar minimum_stay / minimum_date / antecedência
--   5) cron_expire_pending_bookings — libera o hold de pending abandonado (→ cancelled)
--   6) operator_location_occupancy — ocupação por data para o painel do operador
-- simulate_price NÃO é tocado (preserva os golden de docs/simulacao-precos.md).

create extension if not exists pg_cron;

-- 1) Helper: estadia mínima atendida? --------------------------------------
create or replace function public.min_stay_satisfied(
  p_unit public.minimum_stay_unit,
  p_value integer,
  p_total_minutes numeric,
  p_days integer
) returns boolean language sql immutable as $fms$
  select case
    when p_value is null then true
    when p_unit = 'minutes' then p_total_minutes >= p_value
    when p_unit = 'hours'   then p_total_minutes >= p_value * 60
    when p_unit = 'days'    then p_days >= p_value
    when p_unit = 'months'  then p_days >= p_value * 30
    else true
  end;
$fms$;

revoke all on function public.min_stay_satisfied(public.minimum_stay_unit, integer, numeric, integer) from public;
grant all on function public.min_stay_satisfied(public.minimum_stay_unit, integer, numeric, integer) to anon, authenticated, service_role;

-- 2) check_availability: preview de disponibilidade + regras por período ----
create or replace function public.check_availability(
  p_company text,
  p_location text,
  p_parking_type text,
  p_check_in_at timestamp with time zone,
  p_check_out_at timestamp with time zone
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $fca$
declare
  v_lpt_id uuid; v_capacity int; v_active boolean;
  v_near_threshold int; v_near_message text;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_total_minutes numeric; v_days int; v_max_booked int; v_remaining int;
  v_min_stay_ok boolean; v_min_date_ok boolean; v_advance_ok boolean;
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
    and l.deleted_at is null
  limit 1;

  if v_lpt_id is null then
    return jsonb_build_object('error',
      format('Tipo de vaga não encontrado: %s / %s / %s', p_company, p_location, p_parking_type));
  end if;

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_total_minutes / (60 * 24))::int);

  -- data mais cheia do período manda (precisa de vaga em TODAS as datas)
  select coalesce(max(a.booked_count), 0) into v_max_booked
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

  if v_sold_out      then v_reasons := array_append(v_reasons, 'sold_out'); end if;
  if not v_min_stay_ok then v_reasons := array_append(v_reasons, 'min_stay'); end if;
  if not v_min_date_ok then v_reasons := array_append(v_reasons, 'min_date'); end if;
  if not v_advance_ok  then v_reasons := array_append(v_reasons, 'advance'); end if;

  v_ok := not v_sold_out and v_min_stay_ok and v_min_date_ok and v_advance_ok;

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
    'days',                v_days,
    'reasons',             to_jsonb(v_reasons));
end; $fca$;

revoke all on function public.check_availability(text, text, text, timestamp with time zone, timestamp with time zone) from public;
grant all on function public.check_availability(text, text, text, timestamp with time zone, timestamp with time zone) to anon, authenticated, service_role;

-- 3) availability_batch: disponibilidade em lote (edge `search`, sem N+1) ---
create or replace function public.availability_batch(
  p_lpt_ids uuid[],
  p_check_in_at timestamp with time zone,
  p_check_out_at timestamp with time zone
) returns table(
  location_parking_type_id uuid,
  capacity integer,
  remaining integer,
  sold_out boolean,
  near_capacity boolean,
  near_capacity_message text
) language sql stable security definer set search_path to 'public' as $fab$
  with dates as (
    select generate_series(p_check_in_at::date, (p_check_out_at - interval '1 microsecond')::date, '1 day')::date as date
  ),
  maxbooked as (
    select lpt.id as lpt_id, lpt.capacity, lpt.is_active,
           lpt.near_capacity_threshold, lpt.near_capacity_message,
           coalesce(max(a.booked_count), 0) as max_booked
    from public.location_parking_type lpt
    cross join dates d
    left join public.location_parking_availability a
      on a.location_parking_type_id = lpt.id and a.date = d.date
    where lpt.id = any(p_lpt_ids)
    group by lpt.id, lpt.capacity, lpt.is_active, lpt.near_capacity_threshold, lpt.near_capacity_message
  )
  select
    lpt_id,
    capacity,
    greatest(0, capacity - max_booked) as remaining,
    (not is_active) or (capacity - max_booked) <= 0 as sold_out,
    (near_capacity_threshold is not null
      and (capacity - max_booked) > 0
      and (capacity - max_booked) <= near_capacity_threshold) as near_capacity,
    near_capacity_message
  from maxbooked;
$fab$;

revoke all on function public.availability_batch(uuid[], timestamp with time zone, timestamp with time zone) from public;
grant all on function public.availability_batch(uuid[], timestamp with time zone, timestamp with time zone) to anon, authenticated, service_role;

-- 4) create_booking_atomic: aplica minimum_stay / minimum_date / antecedência
--    (redefinido a partir da versão autoritativa de 20260612000000_discount_engine.sql,
--     preservando integralmente a lógica de desconto automático + cupom).
create or replace function public.create_booking_atomic(
  p_profile_id uuid,
  p_location_parking_type_id uuid,
  p_check_in_at timestamp with time zone,
  p_check_out_at timestamp with time zone,
  p_passenger_count integer default null,
  p_has_pcd boolean default false,
  p_vehicle_id uuid default null,
  p_add_on_ids uuid[] default null,
  p_coupon_code text default null,
  p_origin text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $cba$
declare
  v_lpt_id uuid; v_lpt_capacity int; v_lpt_active boolean;
  v_location_id uuid; v_location_slug text; v_company_slug text;
  v_parking_type_id uuid; v_parking_type_code text; v_cpt_id uuid;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes int; v_date date; v_booked int;
  v_sim jsonb; v_price numeric; v_base numeric; v_old_price numeric; v_subtotal numeric;
  v_code text; v_booking_id uuid; v_expires_at timestamptz;
  v_add_on_id uuid; v_add_on_name text; v_add_on_price numeric;
  v_coupon_id uuid; v_discount numeric := 0; v_total numeric;
  v_line_items jsonb := '[]'::jsonb; v_eval record;
  v_auto_rule uuid; v_auto_discount numeric := 0; v_auto_stack boolean := true; v_disc record;
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

  -- regras de reserva (capacity-rules) — bloqueiam antes de segurar a vaga
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
    select booked_count into v_booked from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date for update;
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

  -- desconto automático autoritativo (com check_in p/ advance_days)
  for v_disc in
    select * from public.discount_evaluate(v_location_id, v_cpt_id, v_base, v_days, p_check_in_at)
  loop
    v_auto_rule := v_disc.discount_rule_id;
    v_auto_discount := coalesce(v_disc.discount, 0);
    v_auto_stack := coalesce(v_disc.allow_coupon_stack, true);
  end loop;

  v_subtotal := v_base - v_auto_discount;
  if v_auto_discount > 0 then v_old_price := v_base; end if;

  -- cupom (empilha sobre o subtotal já descontado)
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
    total_amount, currency, passenger_count, has_pcd, origin, status, expires_at
  ) values (
    v_code, p_profile_id, v_location_id, p_vehicle_id, p_check_in_at, p_check_out_at,
    v_total, 'BRL', p_passenger_count, p_has_pcd, p_origin, 'pending', v_expires_at
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

  return jsonb_build_object(
    'code', v_code, 'booking_id', v_booking_id, 'total_amount', v_total,
    'subtotal', v_subtotal, 'base_price', v_base,
    'discount', v_discount, 'auto_discount', v_auto_discount,
    'old_price', v_old_price, 'days', v_days, 'expires_at', v_expires_at,
    'line_items', v_line_items);
end; $cba$;

revoke all on function public.create_booking_atomic(uuid, uuid, timestamp with time zone, timestamp with time zone, integer, boolean, uuid, uuid[], text, text) from public;
grant all on function public.create_booking_atomic(uuid, uuid, timestamp with time zone, timestamp with time zone, integer, boolean, uuid, uuid[], text, text) to authenticated, service_role;

-- 5) Expiração de pending abandonado → libera hold + cancela ----------------
create or replace function public.cron_expire_pending_bookings()
returns integer language plpgsql security definer set search_path to 'public' as $fe$
declare v_id uuid; n integer := 0;
begin
  for v_id in
    select id from public.booking
    where status = 'pending' and expires_at is not null and expires_at < now() and deleted_at is null
  loop
    perform public.release_booking_capacity(v_id);
    update public.booking set status = 'cancelled', deleted_at = now() where id = v_id;
    n := n + 1;
  end loop;
  return n;
end; $fe$;

revoke all on function public.cron_expire_pending_bookings() from public;
grant all on function public.cron_expire_pending_bookings() to service_role;

-- agenda a cada 5 min (upsert por jobname)
select cron.schedule('expire-pending-bookings', '*/5 * * * *',
  $$ select public.cron_expire_pending_bookings(); $$);

-- 6) Ocupação por data (painel do operador) ---------------------------------
create or replace function public.operator_location_occupancy(
  p_location_id uuid,
  p_from date,
  p_to date
) returns table(
  location_parking_type_id uuid,
  parking_type_name text,
  date date,
  capacity integer,
  booked_count integer
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
    select lpt.id, pt.name, d.date::date, lpt.capacity, coalesce(a.booked_count, 0)
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
