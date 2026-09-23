-- Mudança de data chega ao white-label (23/09/2026). Spec: docs/specs/shared-availability.md,
-- tarifas-operacao.md (2.8).
--
-- O sync com o WL é por (external_id, operation) e idempotente: um segundo `reserve` do mesmo id
-- é ignorado lá. Então troca de data e extensão por voo nunca chegavam ao parceiro: a portaria
-- via as datas velhas. Agora cada mudança de período libera o id atual e reserva um id novo
-- (`<booking>#<versão>`), e o cancelamento libera o id vigente.

alter table public.booking add column if not exists wl_external_version integer not null default 1;

create or replace function public.wl_external_id(p_booking_id uuid) returns text
  language sql stable set search_path = public, pg_temp as $$
  select case when b.wl_external_version > 1 then b.id::text || '#' || b.wl_external_version else b.id::text end
    from public.booking b where b.id = p_booking_id;
$$;

CREATE OR REPLACE FUNCTION public.wl_enqueue_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_op text := tg_argv[0]; v_booking_id uuid; v_pt uuid; v_rec record;
begin
  if tg_table_name = 'booking_item' then
    v_booking_id := new.booking_id; v_pt := new.parking_type_id;
  else
    v_booking_id := new.id;
    select parking_type_id into v_pt from public.booking_item where booking_id = v_booking_id and item_type = 'parking' limit 1;
  end if;
  if v_pt is null then return new; end if;
  select c.id as company_id, c.wl_sync_enabled, lpt.wl_category_slug, lpt.wl_product_slug, b.check_in_at, b.check_out_at
    into v_rec
  from public.booking b
  join public.location l on l.id = b.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.parking_type_id = v_pt and cpt.company_id = c.id
  join public.location_parking_type lpt on lpt.location_id = l.id and lpt.company_parking_type_id = cpt.id
  where b.id = v_booking_id limit 1;
  if not coalesce(v_rec.wl_sync_enabled, false) or v_rec.wl_category_slug is null or v_rec.wl_product_slug is null then return new; end if;
  insert into public.wl_delivery (company_id, event_id, operation, payload)
  values (v_rec.company_id, public.wl_external_id(v_booking_id) || ':' || v_op, v_op,
    jsonb_build_object('external_id', public.wl_external_id(v_booking_id), 'operation', v_op,
      'category_slug', v_rec.wl_category_slug, 'product_slug', v_rec.wl_product_slug, 'quantity', 1,
      'start_date', to_char(v_rec.check_in_at, 'YYYY-MM-DD'), 'end_date', to_char(v_rec.check_out_at, 'YYYY-MM-DD')))
  on conflict (event_id) do nothing;
  return new;
end; $function$

;

-- Período mudou: libera a reserva vigente no WL e reserva de novo com as datas novas, em outro id.
create or replace function public.wl_enqueue_dates_changed(p_booking_id uuid) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rec record; v_pt uuid; v_old text; v_new text;
begin
  select bi.parking_type_id into v_pt from public.booking_item bi
   where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  if v_pt is null then return; end if;
  select c.id as company_id, c.wl_sync_enabled, lpt.wl_category_slug, lpt.wl_product_slug,
         b.check_in_at, b.check_out_at, b.status
    into v_rec
    from public.booking b
    join public.location l on l.id = b.location_id
    join public.company c on c.id = l.company_id
    join public.company_parking_type cpt on cpt.parking_type_id = v_pt and cpt.company_id = c.id
    join public.location_parking_type lpt on lpt.location_id = l.id and lpt.company_parking_type_id = cpt.id
   where b.id = p_booking_id limit 1;
  if not coalesce(v_rec.wl_sync_enabled, false) or v_rec.wl_category_slug is null or v_rec.wl_product_slug is null then return; end if;
  if v_rec.status not in ('pending', 'confirmed', 'checked_in') then return; end if;

  v_old := public.wl_external_id(p_booking_id);
  insert into public.wl_delivery (company_id, event_id, operation, payload)
  values (v_rec.company_id, v_old || ':release', 'release',
    jsonb_build_object('external_id', v_old, 'operation', 'release',
      'category_slug', v_rec.wl_category_slug, 'product_slug', v_rec.wl_product_slug, 'quantity', 1))
  on conflict (event_id) do nothing;

  update public.booking set wl_external_version = wl_external_version + 1 where id = p_booking_id;
  v_new := public.wl_external_id(p_booking_id);
  insert into public.wl_delivery (company_id, event_id, operation, payload)
  values (v_rec.company_id, v_new || ':reserve', 'reserve',
    jsonb_build_object('external_id', v_new, 'operation', 'reserve',
      'category_slug', v_rec.wl_category_slug, 'product_slug', v_rec.wl_product_slug, 'quantity', 1,
      'start_date', to_char(v_rec.check_in_at, 'YYYY-MM-DD'), 'end_date', to_char(v_rec.check_out_at, 'YYYY-MM-DD')))
  on conflict (event_id) do nothing;
end $$;
revoke all on function public.wl_enqueue_dates_changed(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.change_booking_dates(p_booking_id uuid, p_check_in timestamp with time zone, p_check_out timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_old_check_in timestamptz; v_old_cancel_until timestamptz;
  v_line_items jsonb;
begin
  select status, location_id, fare_tier, fare_price_cents, check_in_at, fare_cancel_until
    into v_status, v_location_id, v_fare_tier, v_fare_cents, v_old_check_in, v_old_cancel_until
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if v_status <> 'pending' then
    raise exception 'Só dá pra alterar as datas antes do pagamento. Numa reserva paga, cancele e refaça (a Superflex cancela grátis até 1 min antes).' using errcode = 'P0001';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;
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

  v_fare_price := coalesce(v_fare_cents, 0) / 100.0;
  -- A janela de cancelamento vem da RESERVA (o que o cliente comprou), não do catálogo de hoje:
  -- catálogo muda o futuro, nunca o passado. Reserva sem janela segue sem janela.
  select benefits into v_fare_benefits from public.fare where tier = v_fare_tier;
  if v_old_cancel_until is not null then
    v_window := round(extract(epoch from (v_old_check_in - v_old_cancel_until)) / 60)::int;
    v_fare_cancel_until := p_check_in - (v_window || ' minutes')::interval;
  else
    v_fare_cancel_until := null;
  end if;

  v_total := v_subtotal + v_addons + v_fare_price;

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

  perform public.wl_enqueue_dates_changed(p_booking_id);
  return jsonb_build_object('booking_id', p_booking_id, 'days', v_days, 'total_amount', v_total);
end; $function$
;


CREATE OR REPLACE FUNCTION public.apply_paid_date_change(p_booking_id uuid, p_check_in timestamp with time zone, p_check_out timestamp with time zone, p_actor_id uuid DEFAULT NULL::uuid, p_acquire boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status public.booking_status; v_location_id uuid; v_fare_tier public.fare_tier; v_fare_cents int;
  v_old_in timestamptz; v_old_out timestamptz; v_old_total numeric;
  v_pt uuid; v_lpt_id uuid; v_capacity int;
  v_company_slug text; v_location_slug text; v_pt_code text; v_cpt_id uuid;
  v_days int; v_total_minutes numeric; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_sim jsonb; v_price numeric; v_base numeric; v_old_price numeric; v_subtotal numeric;
  v_auto_rule uuid; v_auto_discount numeric := 0; v_disc record;
  v_addons numeric; v_fare_price numeric; v_total numeric;
  v_window int; v_fare_cancel_until timestamptz; v_line_items jsonb; v_old_cancel_until timestamptz;
begin
  select status, check_in_at, check_out_at, total_amount, location_id, fare_tier, fare_price_cents, fare_cancel_until
    into v_status, v_old_in, v_old_out, v_old_total, v_location_id, v_fare_tier, v_fare_cents, v_old_cancel_until
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if v_old_in = p_check_in and v_old_out = p_check_out then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;

  select bi.parking_type_id into v_pt
  from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  select lpt.id, lpt.capacity, c.slug, l.slug, pt.code, cpt.id
    into v_lpt_id, v_capacity, v_company_slug, v_location_slug, v_pt_code, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;
  if v_lpt_id is null then raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001'; end if;

  v_total_minutes := extract(epoch from (p_check_out - p_check_in)) / 60;
  v_days := greatest(1, ceil(v_total_minutes / (60 * 24))::int);

  for v_date in
    select generate_series(v_old_in::date, (v_old_out - interval '1 microsecond')::date, '1 day')::date
  loop
    continue when v_date >= p_check_in::date and v_date <= (p_check_out - interval '1 microsecond')::date;
    update public.location_parking_availability set booked_count = greatest(0, booked_count - 1)
    where location_parking_type_id = v_lpt_id and date = v_date;
  end loop;

  if p_acquire then
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
  end if;

  v_sim := public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days);
  v_price := (v_sim ->> 'price')::numeric;
  v_base := coalesce(nullif(v_sim ->> 'base_price', '')::numeric, v_price);
  v_old_price := nullif(v_sim ->> 'old_price', '')::numeric;
  if v_base is null then raise exception 'Preço indisponível para essa configuração.' using errcode = 'P0001'; end if;
  for v_disc in select * from public.discount_evaluate(v_location_id, v_cpt_id, v_base, v_days, p_check_in) loop
    v_auto_rule := v_disc.discount_rule_id; v_auto_discount := coalesce(v_disc.discount, 0);
  end loop;
  v_subtotal := v_base - v_auto_discount;
  if v_auto_discount > 0 then v_old_price := v_base; end if;

  delete from public.booking_coupon where booking_id = p_booking_id;
  update public.booking_item set unit_price = v_subtotal, subtotal = v_subtotal
  where booking_id = p_booking_id and item_type = 'parking';
  select coalesce(sum(subtotal), 0) into v_addons
  from public.booking_item where booking_id = p_booking_id and item_type = 'add_on';

  v_fare_price := coalesce(v_fare_cents, 0) / 100.0;
  -- Janela da RESERVA, não do catálogo de hoje (catálogo muda o futuro, nunca o passado).
  if v_old_cancel_until is not null then
    v_window := round(extract(epoch from (v_old_in - v_old_cancel_until)) / 60)::int;
    v_fare_cancel_until := p_check_in - (v_window || ' minutes')::interval;
  else
    v_fare_cancel_until := null;
  end if;
  v_total := v_subtotal + v_addons + v_fare_price;

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
    check_in_at = p_check_in, check_out_at = p_check_out, total_amount = v_total,
    fare_cancel_until = v_fare_cancel_until,
    price_breakdown = jsonb_build_object(
      'currency','BRL','days',v_days,'strategy',v_sim->>'strategy','base_price',v_base,
      'old_price',v_old_price,'subtotal',v_subtotal,
      'auto_discount', case when v_auto_discount > 0 then jsonb_build_object('amount',v_auto_discount,'rule_id',v_auto_rule,'label',v_sim->'discount'->>'label') else null end,
      'coupon', null,
      'fare', case when v_fare_price > 0 then jsonb_build_object('tier',v_fare_tier,'label',(select label from public.fare where tier=v_fare_tier),'amount',v_fare_price) else null end,
      'total', v_total, 'line_items', v_line_items)
  where id = p_booking_id;

  perform public.log_booking_modification(
    p_booking_id, 'date_change', p_actor_id, case when p_actor_id is null then 'system' else 'customer' end,
    jsonb_build_object(
      'from', jsonb_build_object('check_in_at', v_old_in, 'check_out_at', v_old_out),
      'to', jsonb_build_object('check_in_at', p_check_in, 'check_out_at', p_check_out)),
    round((v_total - coalesce(v_old_total, 0)) * 100)::int, 'alteração de datas (reserva paga)');

  perform public.wl_enqueue_dates_changed(p_booking_id);
  return jsonb_build_object('applied', true, 'days', v_days, 'total_amount', v_total,
    'delta_cents', round((v_total - coalesce(v_old_total, 0)) * 100)::int);
end; $function$
;

create or replace function public.extend_booking_flight_delay(
  p_booking_id uuid,
  p_new_check_out_at timestamptz,
  p_actor text default 'system',
  p_reason text default null,
  p_flight_number text default null
) returns jsonb
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_status public.booking_status; v_check_in timestamptz; v_check_out timestamptz;
  v_location_id uuid; v_benefits jsonb; v_pt uuid; v_code text; v_company_id uuid;
  v_lpt_id uuid; v_cap int; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_added int := 0;
  v_max_hours int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'flight_extension_max_hours'), 24);
  v_after_min int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'flight_extension_after_checkout_minutes'), 120);
  v_flight text := nullif(upper(trim(coalesce(p_flight_number, ''))), '');
  v_company_slug text; v_location_slug text; v_pt_code text; v_take int;
  v_days int; v_price_before numeric; v_price_after numeric; v_credit int := 0; v_settlement uuid;
begin
  select status, check_in_at, check_out_at, location_id, fare_benefits, code, coalesce(commission_take_rate_bps, -1)
    into v_status, v_check_in, v_check_out, v_location_id, v_benefits, v_code, v_take
  from public.booking where id = p_booking_id and deleted_at is null
  for update;

  if v_status is null then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;
  if not coalesce((v_benefits ->> 'flight_delay_protection')::boolean, false) then
    raise exception 'Proteção contra atraso de voo disponível só na Tarifa Superflex.' using errcode = 'P0001';
  end if;
  if v_status not in ('confirmed', 'checked_in') then
    raise exception 'Só reservas confirmadas ou em andamento podem ser estendidas.' using errcode = 'P0001';
  end if;
  if v_flight is null then
    raise exception 'Informe o número do voo para acionar a proteção.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_fare_extension where booking_id = p_booking_id) then
    raise exception 'A proteção contra atraso de voo já foi usada nesta reserva.' using errcode = 'P0001';
  end if;
  if now() > v_check_out + make_interval(mins => v_after_min) then
    raise exception 'A proteção só pode ser acionada até % minutos depois da saída prevista.', v_after_min using errcode = 'P0001';
  end if;
  if p_new_check_out_at <= v_check_out then
    raise exception 'A nova saída precisa ser depois da saída atual.' using errcode = 'P0001';
  end if;
  if p_new_check_out_at > v_check_out + make_interval(hours => v_max_hours) then
    raise exception 'A proteção estende a saída em até % horas. Para mais tempo, altere a data da reserva.', v_max_hours using errcode = 'P0001';
  end if;

  select bi.parking_type_id into v_pt
  from public.booking_item bi
  where bi.booking_id = p_booking_id and bi.item_type = 'parking'
  limit 1;

  select lpt.id, lpt.capacity, c.slug, l.slug, pt.code, c.id, case when v_take >= 0 then v_take else c.take_rate_bps end
    into v_lpt_id, v_cap, v_company_slug, v_location_slug, v_pt_code, v_company_id, v_take
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;

  if v_lpt_id is null then
    raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001';
  end if;

  for v_date in
    select generate_series(
      (v_check_out - interval '1 microsecond')::date + 1,
      (p_new_check_out_at - interval '1 microsecond')::date,
      '1 day')::date
  loop
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0) on conflict (location_parking_type_id, date) do nothing;
    select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
    from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date for update;
    if v_blocked then
      raise exception 'Data % indisponível (bloqueada pelo estacionamento).', v_date using errcode = 'P0001';
    end if;
    if v_booked + coalesce(v_external, 0) >= v_cap then
      raise exception 'Sem disponibilidade para estender até %.', v_date using errcode = 'P0001';
    end if;
    update public.location_parking_availability set booked_count = booked_count + 1
    where location_parking_type_id = v_lpt_id and date = v_date;
    v_added := v_added + 1;
  end loop;

  -- A diária extra é custo da Movepark (Q-027): crédito ao parceiro pela parte dele no dia a mais,
  -- pelo motor de preço. Sem preço (unidade sem tabela) o crédito fica zero e a extensão segue.
  if v_added > 0 then
    v_days := greatest(1, ceil(extract(epoch from (v_check_out - v_check_in)) / 86400)::int);
    begin
      v_price_before := (public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days) ->> 'price')::numeric;
      v_price_after  := (public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days + v_added) ->> 'price')::numeric;
    exception when others then
      v_price_before := null; v_price_after := null;
    end;
    if v_price_before is not null and v_price_after is not null and v_price_after > v_price_before then
      v_credit := round((v_price_after - v_price_before) * 100 * (10000 - coalesce(v_take, 0)) / 10000)::int;
    end if;
    if v_credit > 0 then
      insert into public.payout_debt_settlement (company_id, provider, amount_cents, kind, note)
      values (v_company_id, 'pagarme', v_credit, 'flight_extension_credit',
              format('Extensão por atraso de voo da reserva %s (%s diária(s)), paga pela Movepark', v_code, v_added))
      returning id into v_settlement;
    end if;
  end if;

  update public.booking set check_out_at = p_new_check_out_at, flight_number = coalesce(flight_number, v_flight)
   where id = p_booking_id;

  insert into public.booking_fare_extension (booking_id, old_check_out_at, new_check_out_at, added_days, actor, reason, flight_number, partner_credit_cents, settlement_id)
  values (p_booking_id, v_check_out, p_new_check_out_at, v_added, coalesce(p_actor, 'system'), p_reason, v_flight, v_credit, v_settlement);

  perform public.wl_enqueue_dates_changed(p_booking_id);
  return jsonb_build_object(
    'booking_id', p_booking_id,
    'old_check_out_at', v_check_out,
    'new_check_out_at', p_new_check_out_at,
    'added_days', v_added,
    'partner_credit_cents', v_credit);
end $$;
