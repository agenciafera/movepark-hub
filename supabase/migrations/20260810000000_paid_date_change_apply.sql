-- E2.8-h (Fase B, B2.1) · Alterar datas de reserva PAGA: RPCs de capacidade + apply.
-- Fluxo (delta > 0, mais caro): hold_paid_date_change segura a vaga das NOVAS datas (mantém as
-- antigas) → cobra o delta por PIX → apply_paid_date_change (no webhook) libera as antigas e move.
-- Se o PIX expira, expire_paid_date_change_hold libera o hold das novas. Delta <= 0 chama apply direto.
-- Re-preço a preço atual (simulate_price), igual à change_booking_dates. Ver booking-modifications.md §8.

-- Segura a capacidade das NOVAS datas (não move a reserva). Valida política + disponibilidade.
create or replace function public.hold_paid_date_change(
  p_booking_id uuid, p_check_in timestamptz, p_check_out timestamptz
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_status public.booking_status; v_location_id uuid; v_check_in timestamptz; v_pt uuid;
  v_lpt_id uuid; v_capacity int;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes numeric; v_date date; v_booked int; v_blocked boolean; v_external int;
begin
  select status, location_id, check_in_at into v_status, v_location_id, v_check_in
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if v_status <> 'confirmed' then
    raise exception 'Só reserva confirmada e paga altera datas com cobrança.' using errcode = 'P0001';
  end if;
  if v_check_in <= now() then raise exception 'A reserva já começou.' using errcode = 'P0001'; end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;

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

-- Aplica a troca: libera as datas ANTIGAS (as novas já estão seguras pelo hold, ou seguras aqui
-- quando p_acquire=true no caminho delta<=0), re-precifica a preço atual e move a reserva.
-- Idempotente: se já está nas novas datas, noop (webhook pode reentregar).
create or replace function public.apply_paid_date_change(
  p_booking_id uuid, p_check_in timestamptz, p_check_out timestamptz,
  p_actor_id uuid default null, p_acquire boolean default false
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_status public.booking_status; v_location_id uuid; v_fare_tier public.fare_tier; v_fare_cents int;
  v_old_in timestamptz; v_old_out timestamptz; v_old_total numeric;
  v_pt uuid; v_lpt_id uuid; v_capacity int;
  v_company_slug text; v_location_slug text; v_pt_code text; v_cpt_id uuid;
  v_days int; v_total_minutes numeric; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_sim jsonb; v_price numeric; v_base numeric; v_old_price numeric; v_subtotal numeric;
  v_auto_rule uuid; v_auto_discount numeric := 0; v_disc record;
  v_addons numeric; v_fare_price numeric; v_total numeric;
  v_window int; v_fare_cancel_until timestamptz; v_line_items jsonb;
begin
  select status, check_in_at, check_out_at, total_amount, location_id, fare_tier, fare_price_cents
    into v_status, v_old_in, v_old_out, v_old_total, v_location_id, v_fare_tier, v_fare_cents
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

  -- Libera as datas antigas.
  perform public.release_booking_capacity(p_booking_id);

  -- Caminho delta<=0 (aplica na hora sem hold prévio): segura as novas datas aqui.
  if p_acquire then
    for v_date in
      select generate_series(p_check_in::date, (p_check_out - interval '1 microsecond')::date, '1 day')::date
    loop
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

  -- Re-preço a preço atual (sem cupom).
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
  select cancel_window_minutes into v_window from public.fare where tier = v_fare_tier;
  if v_window is not null then v_fare_cancel_until := p_check_in - (v_window || ' minutes')::interval; else v_fare_cancel_until := null; end if;
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

  return jsonb_build_object('applied', true, 'days', v_days, 'total_amount', v_total,
    'delta_cents', round((v_total - coalesce(v_old_total, 0)) * 100)::int);
end; $fn$;

-- Expira o hold de uma cobrança de troca de datas não paga: libera a capacidade das NOVAS datas
-- (as datas da reserva não mudaram). Idempotente por status do payment.
create or replace function public.expire_paid_date_change_hold(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_booking_id uuid; v_status text; v_kind text; v_in timestamptz; v_out timestamptz;
  v_location_id uuid; v_pt uuid; v_lpt_id uuid; v_date date;
begin
  select booking_id, status, kind, date_change_check_in_at, date_change_check_out_at
    into v_booking_id, v_status, v_kind, v_in, v_out
  from public.payment where id = p_payment_id for update;
  if v_booking_id is null or v_kind <> 'date_change' or v_status <> 'pending' or v_in is null then
    return jsonb_build_object('released', false);
  end if;

  select location_id into v_location_id from public.booking where id = v_booking_id;
  select bi.parking_type_id into v_pt
  from public.booking_item bi where bi.booking_id = v_booking_id and bi.item_type = 'parking' limit 1;
  select lpt.id into v_lpt_id
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;

  for v_date in
    select generate_series(v_in::date, (v_out - interval '1 microsecond')::date, '1 day')::date
  loop
    update public.location_parking_availability set booked_count = greatest(0, booked_count - 1)
    where location_parking_type_id = v_lpt_id and date = v_date;
  end loop;

  update public.payment set status = 'cancelled' where id = p_payment_id;
  return jsonb_build_object('released', true);
end; $fn$;

revoke all on function public.hold_paid_date_change(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.apply_paid_date_change(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon, authenticated;
revoke all on function public.expire_paid_date_change_hold(uuid) from public, anon, authenticated;
grant execute on function public.hold_paid_date_change(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.apply_paid_date_change(uuid, timestamptz, timestamptz, uuid, boolean) to service_role;
grant execute on function public.expire_paid_date_change_hold(uuid) to service_role;
