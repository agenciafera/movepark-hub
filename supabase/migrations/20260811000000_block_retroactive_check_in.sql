-- Bug (E2.2.1) · Reserva não pode aceitar data/hora de entrada retroativa (check-in no passado).
-- Antes: o único piso contra data passada era a antecedência mínima (pricing_rule.advance_booking_minutes),
-- que só dispara quando configurada. Com ela nula, uma reserva "hoje 8h" criada às 14h passava.
-- Agora há uma regra incondicional: o check-in tem que ser futuro. Vale para o checkout, a Public API
-- e as trocas de data (pendente e paga). O front espelha via check_availability.past_ok, mas a VERDADE
-- é aqui (server-authoritative). Ver docs/specs/booking-flow.md e capacity-rules.md.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Regra base: "check-in no passado". Uma folga pequena tolera skew de relógio
--    cliente↔servidor e o tempo entre selecionar e gravar (não é brecha: a folga
--    é de 2 min, o bug era de horas). Fonte única do piso, usada por todos os paths.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.check_in_in_past(p_check_in timestamptz)
returns boolean language sql stable set search_path to 'public' as $$
  select p_check_in < now() - interval '2 minutes';
$$;

create or replace function public.assert_check_in_not_past(p_check_in timestamptz)
returns void language plpgsql stable set search_path to 'public' as $$
begin
  if public.check_in_in_past(p_check_in) then
    raise exception 'A data e o horário de entrada não podem estar no passado.' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.check_in_in_past(timestamptz) to anon, authenticated, service_role;
grant execute on function public.assert_check_in_not_past(timestamptz) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Criação da reserva (_create_booking_core): piso incondicional de data.
--    Corpo idêntico ao de 20260717000000_fare_tiers.sql, só acrescenta a guarda.
-- ─────────────────────────────────────────────────────────────────────────────
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
  p_origin text,
  p_fare_tier public.fare_tier default 'basica'
) returns jsonb language plpgsql security definer set search_path to 'public' as $core$
declare
  v_lpt_id uuid; v_lpt_capacity int; v_lpt_active boolean;
  v_location_id uuid; v_location_slug text; v_company_slug text;
  v_parking_type_id uuid; v_parking_type_code text; v_cpt_id uuid;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes int; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_sim jsonb; v_price numeric; v_base numeric; v_old_price numeric; v_subtotal numeric;
  v_code text; v_booking_id uuid; v_expires_at timestamptz;
  v_add_on_id uuid; v_add_on_name text; v_add_on_price numeric;
  v_coupon_id uuid; v_discount numeric := 0; v_total numeric;
  v_line_items jsonb := '[]'::jsonb; v_eval record;
  v_auto_rule uuid; v_auto_discount numeric := 0; v_auto_stack boolean := true; v_disc record;
  v_breakdown jsonb;
  v_fare public.fare; v_fare_tier public.fare_tier; v_fare_price numeric := 0;
  v_fare_cancel_until timestamptz;
begin
  -- Tarifa (default Básica). Tem que existir e estar ativa no catálogo.
  v_fare_tier := coalesce(p_fare_tier, 'basica');
  select * into v_fare from public.fare where tier = v_fare_tier and is_active = true;
  if v_fare.tier is null then
    raise exception 'Tarifa indisponível.' using errcode = 'P0001';
  end if;
  v_fare_price := v_fare.price_cents / 100.0;
  if v_fare.cancel_window_minutes is not null then
    v_fare_cancel_until := p_check_in_at - (v_fare.cancel_window_minutes || ' minutes')::interval;
  end if;

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
  -- Piso: a entrada não pode ser retroativa (independe de advance_booking_minutes).
  perform public.assert_check_in_not_past(p_check_in_at);

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
    select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
    from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date for update;
    if v_blocked then
      raise exception 'Data % indisponível (bloqueada pelo estacionamento).', v_date using errcode = 'P0001';
    end if;
    if v_booked + coalesce(v_external, 0) >= v_lpt_capacity then
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
  -- Total inclui a Tarifa (receita Movepark). Add-ons incrementam depois.
  v_total := v_subtotal - v_discount + v_fare_price;

  insert into public.booking (
    code, profile_id, location_id, vehicle_id, check_in_at, check_out_at,
    total_amount, currency, passenger_count, has_pcd, origin, status, expires_at,
    created_via_api_key_id, customer_name, customer_email, customer_phone,
    fare_tier, fare_price_cents, fare_cancel_until, fare_benefits
  ) values (
    v_code, p_profile_id, v_location_id, p_vehicle_id, p_check_in_at, p_check_out_at,
    v_total, 'BRL', p_passenger_count, p_has_pcd, p_origin, 'pending', v_expires_at,
    p_created_via_api_key_id, p_customer_name, p_customer_email, p_customer_phone,
    v_fare_tier, v_fare.price_cents, v_fare_cancel_until, v_fare.benefits
  ) returning id into v_booking_id;

  insert into public.booking_item (booking_id, item_type, parking_type_id, quantity, unit_price, subtotal)
  values (v_booking_id, 'parking', v_parking_type_id, 1, v_subtotal, v_subtotal);

  v_line_items := v_line_items || jsonb_build_object(
    'kind', 'parking', 'name', v_parking_type_code, 'quantity', 1,
    'unit_price', v_subtotal, 'subtotal', v_subtotal);

  -- Linha da Tarifa no breakdown (a Básica é grátis → não polui o resumo).
  if v_fare_price > 0 then
    v_line_items := v_line_items || jsonb_build_object(
      'kind', 'fare', 'name', v_fare.label, 'tier', v_fare_tier, 'quantity', 1,
      'unit_price', v_fare_price, 'subtotal', v_fare_price);
  end if;

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
    'fare', case when v_fare_price > 0
      then jsonb_build_object('tier', v_fare_tier, 'label', v_fare.label, 'amount', v_fare_price)
      else null end,
    'total', v_total,
    'line_items', v_line_items);
  update public.booking set price_breakdown = v_breakdown where id = v_booking_id;

  return jsonb_build_object(
    'code', v_code, 'booking_id', v_booking_id, 'total_amount', v_total,
    'subtotal', v_subtotal, 'base_price', v_base,
    'discount', v_discount, 'auto_discount', v_auto_discount,
    'old_price', v_old_price, 'days', v_days, 'expires_at', v_expires_at,
    'fare_tier', v_fare_tier, 'fare_price', v_fare_price, 'fare_cancel_until', v_fare_cancel_until,
    'line_items', v_line_items, 'price_breakdown', v_breakdown);
end; $core$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Leitura: check_availability ganha past_ok (espelho do piso pro front).
--    Corpo idêntico ao de 20260711000000_wl_reconcile_sync.sql, + past_ok/reason.
-- ─────────────────────────────────────────────────────────────────────────────
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
    and l.deleted_at is null
  limit 1;

  if v_lpt_id is null then
    return jsonb_build_object('error',
      format('Tipo de vaga não encontrado: %s / %s / %s', p_company, p_location, p_parking_type));
  end if;

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_total_minutes / (60 * 24))::int);

  -- data mais cheia do período manda (hub + white-label)
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
end; $fca$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Troca de datas de reserva PENDENTE (change_booking_dates): mesmo piso.
--    Corpo idêntico ao de 20260722000000_change_booking_dates.sql, + guarda.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.change_booking_dates(
  p_booking_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_status public.booking_status; v_location_id uuid; v_fare_tier public.fare_tier; v_fare_cents int;
  v_pt uuid; v_lpt_id uuid; v_capacity int; v_active boolean;
  v_company_slug text; v_location_slug text; v_pt_code text; v_pt_id uuid; v_cpt_id uuid;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes int; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_sim jsonb; v_price numeric; v_base numeric; v_old_price numeric; v_subtotal numeric;
  v_auto_rule uuid; v_auto_discount numeric := 0; v_disc record;
  v_addons numeric; v_fare_price numeric; v_total numeric;
  v_window int; v_fare_cancel_until timestamptz; v_fare_benefits jsonb;
  v_line_items jsonb;
begin
  select status, location_id, fare_tier, fare_price_cents
    into v_status, v_location_id, v_fare_tier, v_fare_cents
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if v_status <> 'pending' then
    raise exception 'Só dá pra alterar as datas antes do pagamento. Numa reserva paga, cancele e refaça (a Superflex cancela grátis até 1 min antes).' using errcode = 'P0001';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;
  -- Piso: a nova entrada não pode ser retroativa.
  perform public.assert_check_in_not_past(p_check_in);

  select bi.parking_type_id into v_pt
  from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;

  select lpt.id, lpt.capacity, lpt.is_active, c.slug, l.slug, pt.code, pt.id, cpt.id,
         lpt.has_minimum_stay, lpt.minimum_stay_value, lpt.minimum_stay_unit,
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes
    into v_lpt_id, v_capacity, v_active, v_company_slug, v_location_slug, v_pt_code, v_pt_id, v_cpt_id,
         v_has_min_stay, v_min_stay_value, v_min_stay_unit, v_has_min_date, v_min_date, v_advance_min
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;
  if v_lpt_id is null then raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001'; end if;

  v_total_minutes := extract(epoch from (p_check_out - p_check_in)) / 60;
  v_days := greatest(1, ceil(v_total_minutes::numeric / (60 * 24))::int);

  if v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
    raise exception 'Estadia mínima não atingida para essa vaga.' using errcode = 'P0001';
  end if;
  if v_has_min_date and v_min_date is not null and p_check_in::date < v_min_date then
    raise exception 'Data de entrada antes da data mínima permitida.' using errcode = 'P0001';
  end if;
  if v_advance_min is not null and p_check_in < now() + (v_advance_min || ' minutes')::interval then
    raise exception 'Reserva exige antecedência mínima.' using errcode = 'P0001';
  end if;

  -- Libera a capacidade das datas antigas e segura as novas (atômico: um RAISE reverte tudo).
  perform public.release_booking_capacity(p_booking_id);
  for v_date in
    select generate_series(p_check_in::date, (p_check_out - interval '1 microsecond')::date, '1 day')::date
  loop
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0) on conflict (location_parking_type_id, date) do nothing;
    select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
    from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date for update;
    if v_blocked then
      raise exception 'Data % indisponível (bloqueada pelo estacionamento).', v_date using errcode = 'P0001';
    end if;
    if v_booked + coalesce(v_external, 0) >= v_capacity then
      raise exception 'Sem disponibilidade para %', v_date using errcode = 'P0001';
    end if;
    update public.location_parking_availability set booked_count = booked_count + 1
    where location_parking_type_id = v_lpt_id and date = v_date;
  end loop;

  -- Re-preço da vaga (sem cupom: dropa, pois pode não valer pras novas datas).
  v_sim := public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days);
  v_price := (v_sim ->> 'price')::numeric;
  v_base := coalesce(nullif(v_sim ->> 'base_price', '')::numeric, v_price);
  v_old_price := nullif(v_sim ->> 'old_price', '')::numeric;
  if v_base is null then raise exception 'Preço indisponível para essa configuração.' using errcode = 'P0001'; end if;

  for v_disc in select * from public.discount_evaluate(v_location_id, v_cpt_id, v_base, v_days, p_check_in) loop
    v_auto_rule := v_disc.discount_rule_id;
    v_auto_discount := coalesce(v_disc.discount, 0);
  end loop;
  v_subtotal := v_base - v_auto_discount;
  if v_auto_discount > 0 then v_old_price := v_base; end if;

  delete from public.booking_coupon where booking_id = p_booking_id;
  update public.booking_item set unit_price = v_subtotal, subtotal = v_subtotal
  where booking_id = p_booking_id and item_type = 'parking';

  select coalesce(sum(subtotal), 0) into v_addons
  from public.booking_item where booking_id = p_booking_id and item_type = 'add_on';

  -- Tarifa: preço inalterado; recalcula a janela de cancelamento a partir da nova entrada.
  v_fare_price := coalesce(v_fare_cents, 0) / 100.0;
  select cancel_window_minutes, benefits into v_window, v_fare_benefits from public.fare where tier = v_fare_tier;
  if v_window is not null then v_fare_cancel_until := p_check_in - (v_window || ' minutes')::interval; else v_fare_cancel_until := null; end if;

  v_total := v_subtotal + v_addons + v_fare_price;

  -- Line items (vaga + tarifa + add-ons) para o breakdown.
  select coalesce(jsonb_agg(li order by ord), '[]'::jsonb) into v_line_items from (
    select 1 as ord, jsonb_build_object('kind','parking','name',v_pt_code,'quantity',1,'unit_price',v_subtotal,'subtotal',v_subtotal) as li
    union all
    select 2, jsonb_build_object('kind','fare','name',f.label,'tier',v_fare_tier,'quantity',1,'unit_price',v_fare_price,'subtotal',v_fare_price)
      from public.fare f where f.tier = v_fare_tier and v_fare_price > 0
    union all
    select 3, jsonb_build_object('kind','add_on','name',a.name,'quantity',bi.quantity,'unit_price',bi.unit_price,'subtotal',bi.subtotal)
      from public.booking_item bi join public.add_on_service a on a.id = bi.add_on_service_id
      where bi.booking_id = p_booking_id and bi.item_type = 'add_on'
  ) t;

  update public.booking set
    check_in_at = p_check_in,
    check_out_at = p_check_out,
    total_amount = v_total,
    fare_cancel_until = v_fare_cancel_until,
    price_breakdown = jsonb_build_object(
      'currency','BRL','days',v_days,'strategy',v_sim->>'strategy','base_price',v_base,
      'old_price',v_old_price,'subtotal',v_subtotal,
      'auto_discount', case when v_auto_discount > 0 then jsonb_build_object('amount',v_auto_discount,'rule_id',v_auto_rule,'label',v_sim->'discount'->>'label') else null end,
      'coupon', null,
      'fare', case when v_fare_price > 0 then jsonb_build_object('tier',v_fare_tier,'label',(select label from public.fare where tier=v_fare_tier),'amount',v_fare_price) else null end,
      'total', v_total, 'line_items', v_line_items)
  where id = p_booking_id;

  return jsonb_build_object('booking_id', p_booking_id, 'days', v_days, 'total_amount', v_total);
end; $fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Troca de datas de reserva PAGA (E2.8-h): mesmo piso na cotação e no hold.
--    Corpos idênticos aos de 20260810020000_paid_date_change_overlap_fix.sql.
-- ─────────────────────────────────────────────────────────────────────────────
-- 4a. reprice_booking_dates: cotação read-only. O piso entra na cadeia de motivos
--     (available=false) para o front mostrar antes de cobrar.
create or replace function public.reprice_booking_dates(
  p_booking_id uuid, p_check_in timestamptz, p_check_out timestamptz
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  v_status public.booking_status; v_location_id uuid; v_fare_tier public.fare_tier; v_fare_cents int;
  v_current_total numeric; v_old_in timestamptz; v_old_out timestamptz;
  v_pt uuid; v_lpt_id uuid; v_capacity int;
  v_company_slug text; v_location_slug text; v_pt_code text; v_cpt_id uuid;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes numeric; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_available boolean := true; v_reason text := null;
  v_sim jsonb; v_price numeric; v_base numeric; v_subtotal numeric;
  v_auto_discount numeric := 0; v_disc record; v_addons numeric; v_fare_price numeric; v_new_total numeric;
begin
  select status, location_id, fare_tier, fare_price_cents, total_amount, check_in_at, check_out_at
    into v_status, v_location_id, v_fare_tier, v_fare_cents, v_current_total, v_old_in, v_old_out
  from public.booking where id = p_booking_id and deleted_at is null;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;

  select bi.parking_type_id into v_pt
  from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  select lpt.id, lpt.capacity, c.slug, l.slug, pt.code, cpt.id,
         lpt.has_minimum_stay, lpt.minimum_stay_value, lpt.minimum_stay_unit,
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes
    into v_lpt_id, v_capacity, v_company_slug, v_location_slug, v_pt_code, v_cpt_id,
         v_has_min_stay, v_min_stay_value, v_min_stay_unit, v_has_min_date, v_min_date, v_advance_min
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;
  if v_lpt_id is null then raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001'; end if;

  v_total_minutes := extract(epoch from (p_check_out - p_check_in)) / 60;
  v_days := greatest(1, ceil(v_total_minutes / (60 * 24))::int);

  if public.check_in_in_past(p_check_in) then
    v_available := false; v_reason := 'A data e o horário de entrada não podem estar no passado.';
  elsif v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
    v_available := false; v_reason := 'Estadia mínima não atingida para essa vaga.';
  elsif v_has_min_date and v_min_date is not null and p_check_in::date < v_min_date then
    v_available := false; v_reason := 'Data de entrada antes da data mínima permitida.';
  elsif v_advance_min is not null and p_check_in < now() + (v_advance_min || ' minutes')::interval then
    v_available := false; v_reason := 'Reserva exige antecedência mínima.';
  else
    for v_date in
      select generate_series(p_check_in::date, (p_check_out - interval '1 microsecond')::date, '1 day')::date
    loop
      -- Sobreposição com o range atual: já garantida pela própria reserva.
      continue when v_date >= v_old_in::date and v_date <= (v_old_out - interval '1 microsecond')::date;
      select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
      from public.location_parking_availability
      where location_parking_type_id = v_lpt_id and date = v_date;
      if coalesce(v_blocked, false) then
        v_available := false; v_reason := format('Data %s indisponível (bloqueada pelo estacionamento).', v_date);
        exit;
      end if;
      if coalesce(v_booked, 0) + coalesce(v_external, 0) >= v_capacity then
        v_available := false; v_reason := format('Sem disponibilidade para %s.', v_date);
        exit;
      end if;
    end loop;
  end if;

  v_sim := public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days);
  v_price := (v_sim ->> 'price')::numeric;
  v_base := coalesce(nullif(v_sim ->> 'base_price', '')::numeric, v_price);
  if v_base is null then raise exception 'Preço indisponível para essa configuração.' using errcode = 'P0001'; end if;
  for v_disc in select * from public.discount_evaluate(v_location_id, v_cpt_id, v_base, v_days, p_check_in) loop
    v_auto_discount := coalesce(v_disc.discount, 0);
  end loop;
  v_subtotal := v_base - v_auto_discount;

  select coalesce(sum(subtotal), 0) into v_addons
  from public.booking_item where booking_id = p_booking_id and item_type = 'add_on';
  v_fare_price := coalesce(v_fare_cents, 0) / 100.0;
  v_new_total := v_subtotal + v_addons + v_fare_price;

  return jsonb_build_object(
    'booking_id', p_booking_id, 'days', v_days,
    'current_total_cents', round(coalesce(v_current_total, 0) * 100)::int,
    'new_total_cents', round(v_new_total * 100)::int,
    'delta_cents', round((v_new_total - coalesce(v_current_total, 0)) * 100)::int,
    'available', v_available, 'reason', v_reason);
end; $fn$;

-- 4b. hold_paid_date_change: segura as datas NOVAS. Piso na nova entrada.
create or replace function public.hold_paid_date_change(
  p_booking_id uuid, p_check_in timestamptz, p_check_out timestamptz
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_status public.booking_status; v_location_id uuid; v_old_in timestamptz; v_old_out timestamptz; v_pt uuid;
  v_lpt_id uuid; v_capacity int;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes numeric; v_date date; v_booked int; v_blocked boolean; v_external int;
begin
  select status, location_id, check_in_at, check_out_at into v_status, v_location_id, v_old_in, v_old_out
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if v_status <> 'confirmed' then
    raise exception 'Só reserva confirmada e paga altera datas com cobrança.' using errcode = 'P0001';
  end if;
  if v_old_in <= now() then raise exception 'A reserva já começou.' using errcode = 'P0001'; end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;
  -- Piso: a nova entrada não pode ser retroativa.
  perform public.assert_check_in_not_past(p_check_in);

  select bi.parking_type_id into v_pt
  from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  select lpt.id, lpt.capacity, lpt.has_minimum_stay, lpt.minimum_stay_value, lpt.minimum_stay_unit,
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes
    into v_lpt_id, v_capacity, v_has_min_stay, v_min_stay_value, v_min_stay_unit,
         v_has_min_date, v_min_date, v_advance_min
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;
  if v_lpt_id is null then raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001'; end if;

  v_total_minutes := extract(epoch from (p_check_out - p_check_in)) / 60;
  v_days := greatest(1, ceil(v_total_minutes / (60 * 24))::int);
  if v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
    raise exception 'Estadia mínima não atingida para essa vaga.' using errcode = 'P0001';
  end if;
  if v_has_min_date and v_min_date is not null and p_check_in::date < v_min_date then
    raise exception 'Data de entrada antes da data mínima permitida.' using errcode = 'P0001';
  end if;
  if v_advance_min is not null and p_check_in < now() + (v_advance_min || ' minutes')::interval then
    raise exception 'Reserva exige antecedência mínima.' using errcode = 'P0001';
  end if;

  for v_date in
    select generate_series(p_check_in::date, (p_check_out - interval '1 microsecond')::date, '1 day')::date
  loop
    continue when v_date >= v_old_in::date and v_date <= (v_old_out - interval '1 microsecond')::date;
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0) on conflict (location_parking_type_id, date) do nothing;
    select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
    from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date for update;
    if v_blocked then raise exception 'Data % indisponível (bloqueada pelo estacionamento).', v_date using errcode = 'P0001'; end if;
    if v_booked + coalesce(v_external, 0) >= v_capacity then
      raise exception 'Sem disponibilidade para %', v_date using errcode = 'P0001';
    end if;
    update public.location_parking_availability set booked_count = booked_count + 1
    where location_parking_type_id = v_lpt_id and date = v_date;
  end loop;

  return jsonb_build_object('held', true, 'days', v_days);
end; $fn$;
