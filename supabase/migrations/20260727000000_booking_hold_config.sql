-- E0.3.1-a · Janela de expiração configurável + blindagem do cron (ADR-005).
-- Uma config única (`booking_hold_minutes`) governa o hold da reserva E a validade do QR PIX —
-- nunca dois números soltos. O cron de expiração passa a reconciliar contra `payment`: nunca
-- cancela reserva com pagamento comprometido (paid/authorized/cartão em voo); PIX apenas gerado
-- e não pago continua expirando. Ver docs/specs/booking-flow.md e a auditoria E0.3.1 (06/07/2026).

-- 1) Config única (editável no Manager → Configurações → Pagamentos). ---------
insert into public.app_setting (key, value) values
  ('booking_hold_minutes', '30'),
  ('booking_hold_grace_minutes', '2')
on conflict (key) do nothing;

-- Helpers server-authoritative: clamp defensivo mesmo com clamp no front. security definer para
-- a Edge (service_role) e o _create_booking_core (owner) lerem sem esbarrar na RLS de app_setting.
create or replace function public.get_booking_hold_minutes()
returns integer language sql stable security definer set search_path to 'public' as $$
  select greatest(5, least(1440,
    coalesce((select nullif(value, '')::int from public.app_setting
              where key = 'booking_hold_minutes'), 30)))
$$;
alter function public.get_booking_hold_minutes() owner to postgres;
revoke all on function public.get_booking_hold_minutes() from public, anon, authenticated;
grant execute on function public.get_booking_hold_minutes() to service_role;

create or replace function public.get_booking_hold_grace_minutes()
returns integer language sql stable security definer set search_path to 'public' as $$
  select greatest(0, least(60,
    coalesce((select nullif(value, '')::int from public.app_setting
              where key = 'booking_hold_grace_minutes'), 2)))
$$;
alter function public.get_booking_hold_grace_minutes() owner to postgres;
revoke all on function public.get_booking_hold_grace_minutes() from public, anon, authenticated;
grant execute on function public.get_booking_hold_grace_minutes() to service_role;

-- 2) _create_booking_core: dedupe do literal '30 minutes' → config única. ----
-- Corpo idêntico ao vivo (20260721000000_location_fare.sql, com Tarifa/override/breakdown),
-- trocando SÓ o cálculo de v_expires_at. create or replace (assinatura idêntica, sem drop).
create or replace function public._create_booking_core(
  p_profile_id uuid, p_created_via_api_key_id uuid, p_customer_name text, p_customer_email text,
  p_customer_phone text, p_location_parking_type_id uuid, p_check_in_at timestamptz,
  p_check_out_at timestamptz, p_passenger_count integer, p_has_pcd boolean, p_vehicle_id uuid,
  p_add_on_ids uuid[], p_coupon_code text, p_origin text, p_fare_tier public.fare_tier default 'basica'
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
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
  v_lf_enabled boolean; v_lf_override int; v_eff_fare_cents int;
begin
  v_fare_tier := coalesce(p_fare_tier, 'basica');
  select * into v_fare from public.fare where tier = v_fare_tier and is_active = true;
  if v_fare.tier is null then
    raise exception 'Tarifa indisponível.' using errcode = 'P0001';
  end if;
  -- Override por unidade (E2.8-f): on/off + preço; cai no catálogo quando não há override.
  select enabled, price_cents_override into v_lf_enabled, v_lf_override
  from public.location_fare
  where location_parking_type_id = p_location_parking_type_id and tier = v_fare_tier;
  if v_lf_enabled is not null and v_lf_enabled = false then
    raise exception 'Tarifa indisponível nesta unidade.' using errcode = 'P0001';
  end if;
  v_eff_fare_cents := coalesce(v_lf_override, v_fare.price_cents);
  v_fare_price := v_eff_fare_cents / 100.0;
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
  -- E0.3.1-a: janela única configurável (era literal '30 minutes').
  v_expires_at := now() + make_interval(mins => public.get_booking_hold_minutes());
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
    v_fare_tier, v_eff_fare_cents, v_fare_cancel_until, v_fare.benefits
  ) returning id into v_booking_id;

  insert into public.booking_item (booking_id, item_type, parking_type_id, quantity, unit_price, subtotal)
  values (v_booking_id, 'parking', v_parking_type_id, 1, v_subtotal, v_subtotal);

  v_line_items := v_line_items || jsonb_build_object(
    'kind', 'parking', 'name', v_parking_type_code, 'quantity', 1,
    'unit_price', v_subtotal, 'subtotal', v_subtotal);

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
end; $function$;

-- 3) Cron reconcilia contra payment antes de cancelar (ADR-005). -------------
-- Só cancela `pending` expirado ALÉM do grace que NÃO tenha pagamento comprometido. Troca o
-- update inline por cancel_booking_with_release (único ponto idempotente de cancelar+liberar).
create or replace function public.cron_expire_pending_bookings()
returns integer language plpgsql security definer set search_path to 'public' as $fe$
declare v_id uuid; n integer := 0; v_grace int := public.get_booking_hold_grace_minutes();
begin
  for v_id in
    select b.id
    from public.booking b
    where b.status = 'pending'
      and b.expires_at is not null
      and b.expires_at < now() - make_interval(mins => v_grace)
      and b.deleted_at is null
      -- ADR-005: não cancela reserva com pagamento comprometido (paid/authorized/cartão em voo).
      -- PIX apenas gerado e não pago (method=pix, status=pending) NÃO casa → expira normalmente.
      and not exists (
        select 1 from public.payment p
        where p.booking_id = b.id
          and (
            p.status in ('paid', 'authorized')
            or (p.method = 'card' and p.status not in ('failed', 'cancelled', 'refunded'))
          )
      )
  loop
    perform public.cancel_booking_with_release(v_id, 'expiração automática (hold)');
    n := n + 1;
  end loop;
  return n;
end; $fe$;

revoke all on function public.cron_expire_pending_bookings() from public, anon, authenticated;
grant execute on function public.cron_expire_pending_bookings() to service_role;

-- Reagenda a cada 5 min (upsert por jobname).
select cron.schedule('expire-pending-bookings', '*/5 * * * *',
  $$ select public.cron_expire_pending_bookings(); $$);
