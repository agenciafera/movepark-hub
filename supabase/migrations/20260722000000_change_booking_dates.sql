-- E2.8-f (Frente B) · Alterar data/horário da reserva (benefício date_change, Flex+).
-- SÓ para reservas PENDING (antes do pagamento): re-segura capacidade do novo período (atômico),
-- re-precifica a vaga (simulate_price + desconto automático), mantém a Tarifa (recalcula a janela)
-- e os add-ons, e dropa o cupom (pode não valer pras novas datas). Para reserva PAGA, recusa e
-- orienta cancelar+refazer (não mexemos no dinheiro de reserva paga aqui).

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

revoke all on function public.change_booking_dates(uuid, timestamptz, timestamptz) from public;
grant execute on function public.change_booking_dates(uuid, timestamptz, timestamptz) to service_role;
