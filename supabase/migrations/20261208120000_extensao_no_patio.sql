-- Estender a saída com o carro no pátio (26/11/2026, parte 2 de
-- docs/superpowers/specs/2026-11-26-acoes-do-cliente-no-operador-design.md §4).
--
-- O caso mais comum do balcão é "a volta atrasou e o carro já está aí", e a troca de datas recusava
-- tudo depois da entrada: a cotação barrava entrada no passado e a reserva da vaga só aceitava
-- reserva confirmada antes do check-in. Em vez de duplicar o motor da troca, as duas funções ganham
-- o modo extensão (`p_extension`), que só a Edge chama, para a equipe com `bookings:write`:
--   - a entrada não muda (outra entrada é erro) e por isso não é recusada por estar no passado;
--   - vale para reserva confirmada, no pátio ou concluída pelo sistema sem saída registrada (o
--     `cron_complete_bookings` conclui uma hora depois da saída prevista, com o carro lá);
--   - a nova saída tem de ser depois da reservada;
--   - a diferença é a da troca (tabela da compra, cupom continua), com piso zero: estadia maior que
--     custa menos não devolve nada, porque depois da entrada não há devolução (Termos 7.3), e aí o
--     valor da vaga fica como estava;
--   - estadia mínima, data mínima e antecedência não se aplicam: a estadia só cresce.
-- A gravação (`apply_paid_date_change`) e a liberação da vaga (`expire_paid_date_change_hold`) já
-- servem como estão: não olham status e, com a entrada igual, só mexem nos dias acrescentados.
-- O status não volta de concluída para no pátio: a conclusão dispara cashback, clube e indicação, e
-- a trava de transição de status não deixa voltar.

drop function if exists public.reprice_booking_dates(uuid, timestamptz, timestamptz);

create or replace function public.reprice_booking_dates(
  p_booking_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_extension boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status public.booking_status; v_location_id uuid; v_total numeric;
  v_old_in timestamptz; v_old_out timestamptz; v_checked_out timestamptz; v_pb jsonb; v_snapshot jsonb;
  v_pt uuid; v_lpt_id uuid; v_capacity int;
  v_company_slug text; v_location_slug text; v_pt_code text; v_cpt_id uuid;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int; v_tolerance int;
  v_days int; v_days_old int; v_total_minutes numeric; v_date date;
  v_booked int; v_blocked boolean; v_external int;
  v_available boolean := true; v_reason text := null;
  v_prices jsonb; v_sim jsonb; v_source text; v_t_new numeric; v_t_old numeric; v_min_days int;
  v_subtotal_old numeric; v_subtotal_new numeric;
  v_coupon_type public.discount_type; v_coupon_value numeric; v_coupon_max numeric; v_coupon_funded text;
  v_has_coupon boolean := false; v_disc_old numeric := 0; v_disc_new numeric := 0;
  v_delta numeric; v_partner_delta numeric;
begin
  select b.status, b.location_id, b.total_amount, b.check_in_at, b.check_out_at, b.checked_out_at,
         b.price_breakdown, b.price_by_days
    into v_status, v_location_id, v_total, v_old_in, v_old_out, v_checked_out, v_pb, v_snapshot
  from public.booking b where b.id = p_booking_id and b.deleted_at is null;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;
  if p_extension and p_check_in is distinct from v_old_in then
    raise exception 'Na extensão, a entrada não muda.' using errcode = 'P0001';
  end if;

  select bi.parking_type_id into v_pt
  from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  select lpt.id, lpt.capacity, c.slug, l.slug, pt.code, cpt.id,
         lpt.has_minimum_stay, lpt.minimum_stay_value, lpt.minimum_stay_unit,
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes, coalesce(l.tolerance_minutes, 0)
    into v_lpt_id, v_capacity, v_company_slug, v_location_slug, v_pt_code, v_cpt_id,
         v_has_min_stay, v_min_stay_value, v_min_stay_unit, v_has_min_date, v_min_date, v_advance_min, v_tolerance
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;
  if v_lpt_id is null then raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001'; end if;

  -- Diárias com a tolerância da unidade: a mesma conta da criação da reserva.
  v_total_minutes := extract(epoch from (p_check_out - p_check_in)) / 60;
  v_days := greatest(1, ceil((v_total_minutes - v_tolerance) / (60 * 24))::int);
  v_days_old := coalesce(nullif(v_pb ->> 'days', '')::int,
    greatest(1, ceil((extract(epoch from (v_old_out - v_old_in)) / 60 - v_tolerance) / (60 * 24))::int));

  if p_extension then
    -- Extensão (26/11/2026): só a saída muda e a estadia só cresce.
    if v_status not in ('confirmed', 'checked_in', 'completed') or v_checked_out is not null then
      v_available := false; v_reason := 'Esta reserva não está mais no pátio: a saída já foi registrada ou ela não está ativa.';
    elsif p_check_out <= v_old_out then
      v_available := false; v_reason := 'A nova saída precisa ser depois da saída reservada.';
    end if;
  elsif public.check_in_in_past(p_check_in) then
    v_available := false; v_reason := 'A data e o horário de entrada não podem estar no passado.';
  elsif v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
    v_available := false; v_reason := 'Estadia mínima não atingida para essa vaga.';
  elsif v_has_min_date and v_min_date is not null and p_check_in::date < v_min_date then
    v_available := false; v_reason := 'Data de entrada antes da data mínima permitida.';
  elsif v_advance_min is not null and p_check_in < now() + (v_advance_min || ' minutes')::interval then
    v_available := false; v_reason := 'Reserva exige antecedência mínima.';
  end if;

  if v_available then
    for v_date in
      select generate_series(p_check_in::date, (p_check_out - interval '1 microsecond')::date, '1 day')::date
    loop
      continue when v_date >= v_old_in::date and v_date <= (v_old_out - interval '1 microsecond')::date;
      select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
      from public.location_parking_availability
      where location_parking_type_id = v_lpt_id and date = v_date;
      if coalesce(v_blocked, false) then
        v_available := false; v_reason := format('Data %s indisponível (bloqueada pelo estacionamento).', to_char(v_date, 'DD/MM'));
        exit;
      end if;
      if coalesce(v_booked, 0) + coalesce(v_external, 0) >= v_capacity then
        v_available := false; v_reason := format('Sem vaga para %s.', to_char(v_date, 'DD/MM'));
        exit;
      end if;
    end loop;
  end if;

  -- Preço das duas durações. Tabela da compra quando a reserva a guardou e cobre as duas; senão a
  -- de hoje. Em qualquer caso a diferença é ENTRE AS DURAÇÕES: mudar só o dia não custa nada.
  v_prices := v_snapshot -> 'prices';
  if v_prices is not null and v_prices ? v_days::text and v_prices ? v_days_old::text then
    v_source := 'compra';
    v_t_new := nullif(v_prices ->> v_days::text, '')::numeric;
    v_t_old := nullif(v_prices ->> v_days_old::text, '')::numeric;
  else
    v_source := 'hoje';
    v_sim := public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days);
    v_t_new := coalesce(nullif(v_sim ->> 'base_price', '')::numeric, nullif(v_sim ->> 'price', '')::numeric);
    v_sim := public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days_old);
    v_t_old := coalesce(nullif(v_sim ->> 'base_price', '')::numeric, nullif(v_sim ->> 'price', '')::numeric);
  end if;

  select bi.subtotal into v_subtotal_old
  from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  v_subtotal_old := coalesce(v_subtotal_old, nullif(v_pb ->> 'subtotal', '')::numeric, 0);

  if v_t_new is null then
    -- A unidade não vende essa duração (estadia mínima da tabela). Diz qual é a menor que vende.
    if v_source = 'compra' then
      select min(k::int) into v_min_days
      from jsonb_each_text(v_prices) as e(k, v) where e.v is not null and k::int > v_days;
    else
      select min(d) into v_min_days from generate_series(v_days + 1, v_days + 30) d
      where public.simulate_price(v_company_slug, v_location_slug, v_pt_code, d) ->> 'price' is not null;
    end if;
    return jsonb_build_object(
      'booking_id', p_booking_id, 'days', v_days, 'days_before', v_days_old, 'price_source', v_source,
      'current_total_cents', round(coalesce(v_total, 0) * 100)::int,
      'new_total_cents', null, 'delta_cents', null, 'available', false, 'extension', p_extension,
      -- Na extensão, o motivo dela (saída antes da reservada, reserva fora do pátio) vem primeiro.
      'reason', case when p_extension and not v_available then v_reason
                     when v_min_days is not null
                     then format('Nesta unidade o mínimo é de %s diárias.', v_min_days)
                     else 'Esta unidade não vende estadia desse tamanho.' end);
  end if;
  -- Sem preço para a duração atual (a tabela de hoje mudou o mínimo): parte do que foi pago.
  v_t_old := coalesce(v_t_old, v_subtotal_old);

  v_subtotal_new := greatest(0, v_subtotal_old + (v_t_new - v_t_old));

  -- Cupom continua (decisão de 17/11/2026): percentual refeito sobre o novo valor, fixo mantido.
  select bc.discount_applied, c.discount_type, c.discount_value, c.max_discount_amount, c.funded_by::text, true
    into v_disc_old, v_coupon_type, v_coupon_value, v_coupon_max, v_coupon_funded, v_has_coupon
  from public.booking_coupon bc join public.coupon c on c.id = bc.coupon_id
  where bc.booking_id = p_booking_id limit 1;
  if not coalesce(v_has_coupon, false) then
    v_disc_old := coalesce(nullif(v_pb -> 'coupon' ->> 'discount', '')::numeric, 0);
    v_coupon_funded := v_pb -> 'coupon' ->> 'funded_by';
  end if;
  v_disc_old := coalesce(v_disc_old, 0);
  if v_coupon_type = 'percent' then
    v_disc_new := round(v_subtotal_new * v_coupon_value / 100, 2);
    if v_coupon_max is not null then v_disc_new := least(v_disc_new, v_coupon_max); end if;
  else
    v_disc_new := least(v_disc_old, v_subtotal_new);
  end if;

  v_delta := (v_subtotal_new - v_disc_new) - (v_subtotal_old - v_disc_old);
  -- Base do repasse: cupom da Movepark não diminui o que o estacionamento recebe (E3.3).
  v_partner_delta := case when v_coupon_funded = 'platform' then v_subtotal_new - v_subtotal_old else v_delta end;

  -- Extensão com piso zero: estadia maior que custa menos (pacote) não devolve nada depois da
  -- entrada, e o valor da vaga fica como estava (só os dias aumentam).
  if p_extension and v_delta < 0 then
    v_subtotal_new := v_subtotal_old;
    v_disc_new := v_disc_old;
    v_delta := 0;
    v_partner_delta := 0;
  end if;

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'days', v_days,
    'days_before', v_days_old,
    'price_source', v_source,
    'current_total_cents', round(coalesce(v_total, 0) * 100)::int,
    'new_total_cents', round((coalesce(v_total, 0) + v_delta) * 100)::int,
    'delta_cents', round(v_delta * 100)::int,
    'subtotal_new', v_subtotal_new,
    'coupon_discount_new', v_disc_new,
    'partner_base_delta_cents', round(v_partner_delta * 100)::int,
    'available', v_available,
    'extension', p_extension,
    'reason', v_reason);
end;
$$;

revoke all on function public.reprice_booking_dates(uuid, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.reprice_booking_dates(uuid, timestamptz, timestamptz, boolean) to service_role;

drop function if exists public.hold_paid_date_change(uuid, timestamptz, timestamptz);

create or replace function public.hold_paid_date_change(
  p_booking_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_extension boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.booking_status; v_location_id uuid; v_old_in timestamptz; v_old_out timestamptz;
  v_checked_out timestamptz; v_pt uuid;
  v_lpt_id uuid; v_capacity int;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes numeric; v_date date; v_booked int; v_blocked boolean; v_external int;
begin
  select status, location_id, check_in_at, check_out_at, checked_out_at
    into v_status, v_location_id, v_old_in, v_old_out, v_checked_out
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;

  if p_extension then
    -- Extensão (26/11/2026): carro no pátio, só a saída muda e ela só cresce.
    if v_status not in ('confirmed', 'checked_in', 'completed') or v_checked_out is not null then
      raise exception 'Esta reserva não está mais no pátio.' using errcode = 'P0001';
    end if;
    if p_check_in is distinct from v_old_in then
      raise exception 'Na extensão, a entrada não muda.' using errcode = 'P0001';
    end if;
    if p_check_out <= v_old_out then
      raise exception 'A nova saída precisa ser depois da saída reservada.' using errcode = 'P0001';
    end if;
  else
    if v_status <> 'confirmed' then
      raise exception 'Só reserva confirmada e paga altera datas com cobrança.' using errcode = 'P0001';
    end if;
    if v_old_in <= now() then raise exception 'A reserva já começou.' using errcode = 'P0001'; end if;
    perform public.assert_check_in_not_past(p_check_in);
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
  if not p_extension then
    if v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
      raise exception 'Estadia mínima não atingida para essa vaga.' using errcode = 'P0001';
    end if;
    if v_has_min_date and v_min_date is not null and p_check_in::date < v_min_date then
      raise exception 'Data de entrada antes da data mínima permitida.' using errcode = 'P0001';
    end if;
    if v_advance_min is not null and p_check_in < now() + (v_advance_min || ' minutes')::interval then
      raise exception 'Reserva exige antecedência mínima.' using errcode = 'P0001';
    end if;
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
end; $$;

revoke all on function public.hold_paid_date_change(uuid, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.hold_paid_date_change(uuid, timestamptz, timestamptz, boolean) to service_role;
