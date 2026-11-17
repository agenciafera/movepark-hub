-- Troca de datas de reserva paga: diferença pela tabela da COMPRA (17/11/2026).
--
-- Substitui a decisão de jul/2026 (docs/specs/booking-modifications.md §8, "re-cota a preço atual"),
-- que cobrava R$ 80 de quem só mudava o dia da viagem quando a tabela tinha subido (MP-BD9A16) e
-- deixava o estacionamento sem receber pelos dias a mais. Decisões do Kallef em 17/11/2026:
--
--   1. A diferença sai da tabela que valia na compra. A reserva passa a guardar, ao nascer, o preço
--      de cada duração (`booking.price_by_days`). O motor de preço não muda. Reserva antiga, sem
--      isso guardado, usa a diferença entre as durações pela tabela de hoje: mudar só o dia = 0.
--   2. Encurtar segue a tabela: se a estadia menor custa mais (pacote de 15 dias da Pare Seguro),
--      cobra a diferença.
--   3. A diferença é da vaga: divide como a reserva (comissão congelada) e entra no extrato do
--      estacionamento. A tarifa é sempre da Movepark e nunca é estornada aqui. No estorno, sai do
--      estacionamento a parte dele das diárias devolvidas e da Movepark a comissão delas.
--   4. O cupom continua: percentual é refeito sobre o novo valor, fixo fica como foi dado.
--
-- Defeitos que a regra antiga tinha e esta migration fecha:
--   - a cotação descontava a tolerância da unidade e a gravação não (cobrava 5 diárias e gravava 6);
--   - o pagamento da diferença recalculava o preço na hora do webhook (agora aplica a cotação que o
--     cliente pagou, gravada em `payment.date_change_quote`);
--   - a troca feita pela equipe ficava no histórico como do cliente.
--
-- Ver docs/specs/booking-modifications.md §8.

-- ── Colunas ─────────────────────────────────────────────────────────────────────
alter table public.booking add column if not exists price_by_days jsonb;
comment on column public.booking.price_by_days is
  'Tabela da compra: preço de cada duração (diárias) da vaga no momento em que a reserva nasceu. '
  'A troca de datas de reserva paga calcula a diferença por ela.';

alter table public.payment add column if not exists date_change_quote jsonb;
alter table public.payment add column if not exists date_change_refunded_cents integer not null default 0;
alter table public.payment add column if not exists date_change_partner_refund_frac numeric not null default 0;
comment on column public.payment.date_change_quote is
  'Cotação da troca de datas que esta cobrança paga (kind date_change). O webhook aplica ESTA conta.';
comment on column public.payment.date_change_refunded_cents is
  'Quanto desta cobrança já voltou ao cliente por troca de datas (só diárias, nunca a tarifa).';
comment on column public.payment.date_change_partner_refund_frac is
  'Fração da perna do estacionamento já devolvida por troca de datas. O extrato usa no lugar da proporção do total.';

-- ── Tabela da compra ────────────────────────────────────────────────────────────
-- Preço de cada duração de 1 até 30 dias além da estadia (teto de 90). ~2 ms por duração.
create or replace function public.price_table_snapshot(
  p_company_slug text, p_location_slug text, p_pt_code text, p_booked_days integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max int := least(90, greatest(30, coalesce(p_booked_days, 1) + 30));
  v_prices jsonb := '{}'::jsonb;
  v_sim jsonb;
  v_base numeric;
begin
  for d in 1..v_max loop
    v_sim := public.simulate_price(p_company_slug, p_location_slug, p_pt_code, d);
    v_base := coalesce(nullif(v_sim ->> 'base_price', '')::numeric, nullif(v_sim ->> 'price', '')::numeric);
    v_prices := v_prices || jsonb_build_object(d::text, v_base);
  end loop;
  return jsonb_build_object('captured_at', now(), 'max_days', v_max, 'prices', v_prices);
end;
$$;
revoke all on function public.price_table_snapshot(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.price_table_snapshot(text, text, text, integer) to service_role;

-- ── Cotação única ───────────────────────────────────────────────────────────────
-- A mesma conta para a prévia do cliente, a Mia, a cobrança e a gravação. Só leitura.
create or replace function public.reprice_booking_dates(p_booking_id uuid, p_check_in timestamptz, p_check_out timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status public.booking_status; v_location_id uuid; v_total numeric;
  v_old_in timestamptz; v_old_out timestamptz; v_pb jsonb; v_snapshot jsonb;
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
  select b.status, b.location_id, b.total_amount, b.check_in_at, b.check_out_at, b.price_breakdown, b.price_by_days
    into v_status, v_location_id, v_total, v_old_in, v_old_out, v_pb, v_snapshot
  from public.booking b where b.id = p_booking_id and b.deleted_at is null;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
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
      'new_total_cents', null, 'delta_cents', null, 'available', false,
      'reason', case when v_min_days is not null
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
    'reason', v_reason);
end;
$$;

-- ── Aplicar a troca ─────────────────────────────────────────────────────────────
-- Grava exatamente a cotação: a que o cliente pagou (vem do pagamento) ou a calculada aqui na hora,
-- antes de mexer na capacidade. Assinatura nova: troca a antiga para não haver sobrecarga ambígua.
drop function if exists public.apply_paid_date_change(uuid, timestamptz, timestamptz, uuid, boolean);
create function public.apply_paid_date_change(
  p_booking_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_actor_id uuid default null,
  p_acquire boolean default false,
  p_actor_role text default null,
  p_quote jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.booking_status; v_location_id uuid; v_fare_tier public.fare_tier; v_fare_cents int;
  v_old_in timestamptz; v_old_out timestamptz; v_old_total numeric; v_old_cancel_until timestamptz; v_pb jsonb;
  v_pt uuid; v_lpt_id uuid; v_capacity int; v_pt_code text;
  v_date date; v_booked int; v_blocked boolean; v_external int;
  v_q jsonb; v_days int; v_subtotal numeric; v_disc numeric; v_total numeric; v_auto numeric;
  v_addons numeric; v_fare_price numeric; v_window int; v_fare_cancel_until timestamptz; v_line_items jsonb;
  v_role text;
begin
  select status, check_in_at, check_out_at, total_amount, location_id, fare_tier, fare_price_cents, fare_cancel_until, price_breakdown
    into v_status, v_old_in, v_old_out, v_old_total, v_location_id, v_fare_tier, v_fare_cents, v_old_cancel_until, v_pb
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if v_old_in = p_check_in and v_old_out = p_check_out then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out precisa ser após o check-in.' using errcode = 'P0001';
  end if;

  -- Antes de mexer na capacidade: depois de segurar a vaga nova, a cotação contaria a própria troca.
  v_q := coalesce(p_quote, public.reprice_booking_dates(p_booking_id, p_check_in, p_check_out));
  if p_quote is null and not coalesce((v_q ->> 'available')::boolean, false) then
    raise exception '%', coalesce(v_q ->> 'reason', 'Datas indisponíveis.') using errcode = 'P0001';
  end if;
  if (v_q ->> 'new_total_cents') is null then
    raise exception 'Cotação sem valor para essas datas.' using errcode = 'P0001';
  end if;

  select bi.parking_type_id into v_pt
  from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  select lpt.id, lpt.capacity, pt.code into v_lpt_id, v_capacity, v_pt_code
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;
  if v_lpt_id is null then raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001'; end if;

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
      if v_blocked then raise exception 'Data % indisponível (bloqueada pelo estacionamento).', to_char(v_date, 'DD/MM') using errcode = 'P0001'; end if;
      if v_booked + coalesce(v_external, 0) >= v_capacity then
        raise exception 'Sem vaga para %.', to_char(v_date, 'DD/MM') using errcode = 'P0001';
      end if;
      update public.location_parking_availability set booked_count = booked_count + 1
      where location_parking_type_id = v_lpt_id and date = v_date;
    end loop;
  end if;

  v_days := (v_q ->> 'days')::int;
  v_subtotal := (v_q ->> 'subtotal_new')::numeric;
  v_disc := coalesce((v_q ->> 'coupon_discount_new')::numeric, 0);
  v_total := (v_q ->> 'new_total_cents')::numeric / 100;
  v_auto := coalesce(nullif(v_pb -> 'auto_discount' ->> 'amount', '')::numeric, 0);

  update public.booking_item set unit_price = v_subtotal, subtotal = v_subtotal
  where booking_id = p_booking_id and item_type = 'parking';
  -- O cupom continua: só o valor do desconto acompanha o novo período.
  update public.booking_coupon set discount_applied = v_disc where booking_id = p_booking_id;
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
    price_breakdown = coalesce(v_pb, '{}'::jsonb) || jsonb_build_object(
      'days', v_days,
      'base_price', v_subtotal + v_auto,
      -- Preço riscado era da duração antiga; não vale para a nova.
      'old_price', null,
      'subtotal', v_subtotal,
      'coupon', case when jsonb_typeof(v_pb -> 'coupon') = 'object'
                     then (v_pb -> 'coupon') || jsonb_build_object('discount', v_disc)
                     else v_pb -> 'coupon' end,
      'total', v_total,
      'line_items', v_line_items,
      'date_change', jsonb_build_object('price_source', v_q ->> 'price_source', 'at', now()))
  where id = p_booking_id;

  v_role := coalesce(p_actor_role, case when p_actor_id is null then 'system' else 'customer' end);
  perform public.log_booking_modification(
    p_booking_id, 'date_change', p_actor_id, v_role,
    jsonb_build_object(
      'from', jsonb_build_object('check_in_at', v_old_in, 'check_out_at', v_old_out),
      'to', jsonb_build_object('check_in_at', p_check_in, 'check_out_at', p_check_out),
      'price_source', v_q ->> 'price_source', 'days', v_days),
    round((v_total - coalesce(v_old_total, 0)) * 100)::int, 'alteração de datas (reserva paga)');

  perform public.wl_enqueue_dates_changed(p_booking_id);
  return jsonb_build_object('applied', true, 'days', v_days, 'total_amount', v_total,
    'delta_cents', round((v_total - coalesce(v_old_total, 0)) * 100)::int);
end;
$$;
revoke all on function public.apply_paid_date_change(uuid, timestamptz, timestamptz, uuid, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_paid_date_change(uuid, timestamptz, timestamptz, uuid, boolean, text, jsonb) to service_role;

-- ── Extrato do estacionamento ───────────────────────────────────────────────────
-- Fração da perna do estacionamento que já voltou ao cliente. Sem estorno de troca de datas é a
-- proporção de sempre (estornado / total). Com ele, a parte das diárias devolvidas sai inteira do
-- que foi gravado na hora (só diárias, nunca a tarifa), e o resto do estorno segue a proporção sobre
-- o que sobrou: estorno total continua dando 1.
create or replace function public.payment_partner_refund_ratio(
  p_amount numeric, p_refunded numeric, p_dc_refunded_cents integer, p_dc_partner_frac numeric
) returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_amount, 0) <= 0 or coalesce(p_refunded, 0) <= 0 then 0::numeric
    when coalesce(p_dc_refunded_cents, 0) <= 0 then least(1::numeric, p_refunded / p_amount)
    else least(1::numeric,
      least(1::numeric, greatest(0::numeric, coalesce(p_dc_partner_frac, 0)))
      + (1 - least(1::numeric, greatest(0::numeric, coalesce(p_dc_partner_frac, 0))))
        * coalesce(least(1::numeric, greatest(0::numeric,
            (p_refunded * 100 - p_dc_refunded_cents) / nullif(p_amount * 100 - p_dc_refunded_cents, 0))), 0))
  end
$$;

-- ── Funções existentes, com as trocas conferidas por contagem ───────────────────
-- Geradas da definição no ar em 17/11/2026: só mudam o tipo de pagamento que conta como venda
-- do estacionamento (booking + date_change) e a fração do estorno da perna dele.

-- Criação da reserva: guarda a tabela da compra.
CREATE OR REPLACE FUNCTION public._create_booking_core(p_profile_id uuid, p_created_via_api_key_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_location_parking_type_id uuid, p_check_in_at timestamp with time zone, p_check_out_at timestamp with time zone, p_passenger_count integer, p_has_pcd boolean, p_vehicle_id uuid, p_add_on_ids uuid[], p_coupon_code text, p_origin text, p_fare_tier fare_tier DEFAULT 'basica'::fare_tier)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_checkout_mode text;
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
  v_fare record; v_fare_tier public.fare_tier; v_fare_price numeric := 0;
  v_fare_cancel_until timestamptz;
begin
  v_fare_tier := coalesce(p_fare_tier, 'basica');
  select * into v_fare from public.get_unit_fares(p_location_parking_type_id) where tier = v_fare_tier;
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
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes, l.checkout_mode
    into v_lpt_id, v_lpt_capacity, v_lpt_active,
         v_location_id, v_location_slug, v_company_slug, v_parking_type_id, v_parking_type_code, v_cpt_id,
         v_has_min_stay, v_min_stay_value, v_min_stay_unit,
         v_has_min_date, v_min_date, v_advance_min, v_checkout_mode
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where lpt.id = p_location_parking_type_id and l.deleted_at is null;

  if v_lpt_id is null then raise exception 'Tipo de vaga não encontrado' using errcode = 'P0001'; end if;
  if not v_lpt_active then raise exception 'Tipo de vaga desativado' using errcode = 'P0001'; end if;
  -- Unidade de checkout externo reserva no site do parceiro (ADR-009). A ficha já manda para lá;
  -- este é o guarda dos outros caminhos (chat, MCP, Public API), que nunca liam checkout_mode e
  -- criavam reserva, com cobrança, em empresa sem recebedor.
  if v_checkout_mode = 'external' then
    raise exception 'Esta unidade reserva pelo site do estacionamento.' using errcode = 'P0001';
  end if;
  if p_check_out_at <= p_check_in_at then
    raise exception 'Check-out precisa ser após o check-in' using errcode = 'P0001';
  end if;
  perform public.assert_check_in_not_past(p_check_in_at);

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil((v_total_minutes - coalesce((select l.tolerance_minutes from public.location l where l.id = v_location_id), 0))::numeric / (60 * 24))::int);

  if v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
    raise exception 'Estadia mínima não atingida para essa vaga: mínimo de %.', public.min_stay_label(v_min_stay_unit, v_min_stay_value) using errcode = 'P0001';
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
  v_expires_at := now() + (public.get_booking_hold_minutes() || ' minutes')::interval;
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
  update public.booking set price_breakdown = v_breakdown,
    -- Tabela da compra (17/11/2026): a troca de datas de reserva paga calcula a diferença por ela.
    price_by_days = public.price_table_snapshot(v_company_slug, v_location_slug, v_parking_type_code, v_days)
  where id = v_booking_id;

  return jsonb_build_object(
    'code', v_code, 'booking_id', v_booking_id, 'total_amount', v_total,
    'subtotal', v_subtotal, 'base_price', v_base,
    'discount', v_discount, 'auto_discount', v_auto_discount,
    'old_price', v_old_price, 'days', v_days, 'expires_at', v_expires_at,
    'fare_tier', v_fare_tier, 'fare_price', v_fare_price, 'fare_cancel_until', v_fare_cancel_until,
    'line_items', v_line_items, 'price_breakdown', v_breakdown);
end; $function$;

-- payout_owed_cents
CREATE OR REPLACE FUNCTION public.payout_owed_cents(p_company_id uuid, p_provider text DEFAULT 'pagarme'::text)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per_payment as (
    select
      p.id,
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind in ('booking', 'date_change')), 0) as partner_cents,
      case
        when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then public.payment_partner_refund_ratio(p.amount, p.refunded_amount, p.date_change_refunded_cents, p.date_change_partner_refund_frac)
        else 0::numeric
      end as refund_ratio
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider
      and p.status = 'paid'
      and loc.company_id = p_company_id
      -- `is false` e não `= false`: NULL (desconhecido) fica de fora, tratado como enviado.
      and p.split_sent_to_gateway is false
    group by p.id, p.kind, p.amount, p.refunded_amount
  )
  select coalesce(sum(partner_cents - round(partner_cents * refund_ratio)), 0)::bigint
  from per_payment;
$function$;

-- payout_balance
CREATE OR REPLACE FUNCTION public.payout_balance(p_company_id uuid, p_provider text DEFAULT 'pagarme'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin     boolean := public.is_hub_admin();
  v_net          bigint;
  v_no_gateway   bigint;
  v_owed         bigint;
  v_transferred  bigint;
  v_withdrawn    bigint;
  v_recipient    jsonb;
  v_debt_raw     bigint;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'payouts:read') then
    raise exception 'Seu papel não permite ver o saldo de repasses (payouts:read).' using errcode = '42501';
  end if;

  with per_payment as (
    select
      p.id,
      (p.split_sent_to_gateway is not false) as foi_ao_gateway,
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind in ('booking', 'date_change')), 0) as partner_cents,
      case
        when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then public.payment_partner_refund_ratio(p.amount, p.refunded_amount, p.date_change_refunded_cents, p.date_change_partner_refund_frac)
        else 0::numeric
      end as refund_ratio
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider
      and p.status = 'paid'
      and loc.company_id = p_company_id
    group by p.id, p.kind, p.amount, p.refunded_amount, p.split_sent_to_gateway
  )
  select
    coalesce(sum(partner_cents - round(partner_cents * refund_ratio)), 0)::bigint,
    coalesce(sum(partner_cents - round(partner_cents * refund_ratio))
      filter (where foi_ao_gateway), 0)::bigint
    into v_net, v_no_gateway
  from per_payment;

  v_owed        := public.payout_owed_cents(p_company_id, p_provider);
  v_transferred := public.payout_transferred_cents(p_company_id, p_provider);
  v_debt_raw    := public.payout_debt_cents(p_company_id, p_provider);

  select coalesce(sum(amount_cents), 0)
    into v_withdrawn
  from public.payout_withdrawal
  where company_id = p_company_id and provider = p_provider
    and status = 'paid' and deleted_at is null;

  select case when pr.balance_synced_at is null then null else jsonb_build_object(
           'available_cents',   coalesce(pr.balance_available_cents, 0),
           'waiting_cents',     coalesce(pr.balance_waiting_cents, 0),
           'transferred_cents', coalesce(pr.balance_transferred_cents, 0),
           'synced_at',         pr.balance_synced_at
         ) end
    into v_recipient
  from public.payout_recipient pr
  where pr.company_id = p_company_id and pr.provider = p_provider and pr.deleted_at is null
  limit 1;

  return jsonb_build_object(
    'company_id', p_company_id,
    'net_partner_cents', v_net,
    'owed_cents', v_owed,
    'gateway_credited_cents', v_no_gateway,
    'transferred_cents', v_transferred,
    'withdrawn_cents', v_withdrawn,
    'balance_cents', greatest(v_owed - v_transferred, 0),
    'overpaid_cents', greatest(v_transferred - v_owed, 0),
    'recipient_balance', v_recipient,
    -- Dívida do parceiro (split dinâmico). `debt_cents` é o que a tela mostra; `debt_raw_cents`
    -- pode ser negativo (abatimento a mais) e é assunto do Manager.
    'debt_cents', greatest(v_debt_raw, 0),
    'debt_raw_cents', v_debt_raw
  );
end;
$function$;

-- payout_debt_cents
CREATE OR REPLACE FUNCTION public.payout_debt_cents(p_company_id uuid, p_provider text DEFAULT 'pagarme'::text)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with per_payment as (
    select
      p.id,
      p.status,
      -- Chargeback pela regra de comissão da venda (E0.3.12): quando gravado, é ELE a dívida.
      p.chargeback_debt_cents,
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind in ('booking', 'date_change')), 0) as partner_cents,
      -- Taxa que o parceiro pagou na captura (charge_processing_fee na perna dele). Fica fora da
      -- dívida: ele devolve o que recebeu, e a Movepark absorve a taxa da venda cancelada (mesma
      -- regra do estorno híbrido). Enquanto a taxa não foi apurada, conta a perna inteira.
      case when coalesce(bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                  filter (where public.split_rule_is_partner(r) and p.kind in ('booking', 'date_change')), false)
           then coalesce(p.gateway_fee_cents, 0) else 0 end as partner_fee_cents,
      case
        when p.status = 'refunded' then 1::numeric
        when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then public.payment_partner_refund_ratio(p.amount, p.refunded_amount, p.date_change_refunded_cents, p.date_change_partner_refund_frac)
        else 0::numeric
      end as refund_ratio
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider
      and loc.company_id = p_company_id
      and p.kind in ('booking', 'date_change')
      and p.split_sent_to_gateway is true
      -- Só o estorno que a Movepark pagou do master gera dívida. Os antigos (jun/jul de 2026)
      -- seguiram o split e o gateway debitou o parceiro sozinho: ninguém ficou devendo.
      and p.refund_absorbed_by_master is true
      and p.status in ('paid', 'refunded')
    group by p.id, p.status, p.kind, p.amount, p.refunded_amount, p.gateway_fee_cents, p.chargeback_debt_cents
  ),
  gerada as (
    select coalesce(sum(coalesce(chargeback_debt_cents::numeric,
                               round(greatest(partner_cents - partner_fee_cents, 0) * refund_ratio))), 0)::bigint as cents from per_payment
  ),
  abatida as (
    -- Cobrança viva: paga, ou pendente ainda dentro da validade (PIX esperando o cliente). Pendente
    -- vencida deixa de contar, e a dívida "volta" para a próxima venda abater.
    select coalesce(sum(p.debt_recovered_cents), 0)::bigint as cents
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    where p.provider = p_provider
      and loc.company_id = p_company_id
      and p.split_sent_to_gateway is true
      and (
        p.status in ('paid', 'authorized', 'refunded')
        or (p.status = 'pending' and coalesce(p.expires_at, p.created_at + interval '1 hour') > now())
      )
  ),
  reservada as (
    select coalesce(sum(amount_cents), 0)::bigint as cents
    from public.payout_debt_reservation
    where company_id = p_company_id and provider = p_provider
      and consumed_by_payment_id is null and expires_at > now()
  ),
  acertos as (
    select coalesce(sum(amount_cents), 0)::bigint as cents
    from public.payout_debt_settlement
    where company_id = p_company_id and provider = p_provider and deleted_at is null
  )
  select gerada.cents - abatida.cents - reservada.cents - acertos.cents
  from gerada, abatida, reservada, acertos;
$function$;

-- payout_debt_lines
CREATE OR REPLACE FUNCTION public.payout_debt_lines(p_company_id uuid, p_provider text DEFAULT 'pagarme'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean := public.is_hub_admin();
  v_origens jsonb; v_abatimentos jsonb; v_acertos jsonb;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'payouts:read') then
    raise exception 'Seu papel não permite ver o saldo de repasses (payouts:read).' using errcode = '42501';
  end if;

  -- Origem: cada estorno/chargeback de cobrança que foi ao gateway, com a perna do parceiro.
  select coalesce(jsonb_agg(jsonb_build_object(
           'booking_code', x.code, 'at', x.refunded_at, 'reason', x.refund_reason,
           'cents', x.cents) order by x.refunded_at desc), '[]'::jsonb)
    into v_origens
  from (
    select b.code, p.refunded_at, p.refund_reason,
           coalesce(p.chargeback_debt_cents, round(greatest(coalesce(sum((r->>'amount')::int)
               filter (where public.split_rule_is_partner(r)), 0)
             - case when coalesce(bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                          filter (where public.split_rule_is_partner(r)), false)
                    then coalesce(p.gateway_fee_cents, 0) else 0 end, 0)
             * case when p.status = 'refunded' then 1::numeric
                    when coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
                      then public.payment_partner_refund_ratio(p.amount, p.refunded_amount, p.date_change_refunded_cents, p.date_change_partner_refund_frac)
                    else 0::numeric end)::bigint) as cents
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = p_provider and loc.company_id = p_company_id
      and p.kind in ('booking', 'date_change') and p.split_sent_to_gateway is true
      and p.refund_absorbed_by_master is true
      and (p.status = 'refunded' or coalesce(p.refunded_amount, 0) > 0)
    group by b.code, p.id, p.status, p.refunded_at, p.refund_reason, p.amount, p.refunded_amount, p.gateway_fee_cents, p.chargeback_debt_cents
  ) x where x.cents > 0;

  -- Abatimentos: cada cobrança que descontou dívida.
  select coalesce(jsonb_agg(jsonb_build_object(
           'booking_code', b.code, 'at', p.paid_at, 'cents', p.debt_recovered_cents,
           'status', p.status::text) order by p.paid_at desc nulls last), '[]'::jsonb)
    into v_abatimentos
  from public.payment p
  join public.booking b    on b.id = p.booking_id
  join public.location loc on loc.id = b.location_id
  where p.provider = p_provider and loc.company_id = p_company_id
    and p.debt_recovered_cents > 0 and p.status in ('paid', 'refunded', 'authorized', 'pending');

  select coalesce(jsonb_agg(jsonb_build_object(
           'at', s.created_at, 'cents', s.amount_cents, 'kind', s.kind, 'note', s.note)
           order by s.created_at desc), '[]'::jsonb)
    into v_acertos
  from public.payout_debt_settlement s
  where s.company_id = p_company_id and s.provider = p_provider and s.deleted_at is null;

  return jsonb_build_object(
    'debt_cents', greatest(public.payout_debt_cents(p_company_id, p_provider), 0),
    'debt_raw_cents', public.payout_debt_cents(p_company_id, p_provider),
    'origins', v_origens,
    'recoveries', v_abatimentos,
    'settlements', v_acertos
  );
end;
$function$;

-- payout_debt_overview
CREATE OR REPLACE FUNCTION public.payout_debt_overview(p_provider text DEFAULT 'pagarme'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_result jsonb;
begin
  if not public.is_hub_admin() then
    raise exception 'Só a Movepark vê as dívidas da rede.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by x.debt_raw_cents desc, x.company_name), '[]'::jsonb)
    into v_result
  from (
    select c.id as company_id, c.name as company_name,
           public.payout_debt_cents(c.id, p_provider) as debt_raw_cents,
           greatest(public.payout_debt_cents(c.id, p_provider), 0) as debt_cents,
           (select min(p.refunded_at) from public.payment p
              join public.booking b on b.id = p.booking_id
              join public.location loc on loc.id = b.location_id
             where loc.company_id = c.id and p.provider = p_provider and p.kind in ('booking', 'date_change')
               and p.split_sent_to_gateway is true and p.refund_absorbed_by_master is true
               and (p.status = 'refunded' or coalesce(p.refunded_amount, 0) > 0)) as since,
           (select max(p.paid_at) from public.payment p
              join public.booking b on b.id = p.booking_id
              join public.location loc on loc.id = b.location_id
             where loc.company_id = c.id and p.provider = p_provider
               and p.debt_recovered_cents > 0) as last_recovery_at
    from public.company c
    where c.deleted_at is null
      and (
        public.payout_debt_cents(c.id, p_provider) <> 0
        or exists (select 1 from public.payout_debt_settlement s
                    where s.company_id = c.id and s.provider = p_provider and s.deleted_at is null)
      )
  ) x;
  return v_result;
end;
$function$;

-- payout_withdrawable
CREATE OR REPLACE FUNCTION public.payout_withdrawable(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_days int := public.payout_release_days(p_company_id);
  v_released bigint := 0;
  v_retained bigint := 0;
  v_transfers_in bigint := 0;
  v_withdrawn bigint := 0;
  v_debt bigint := 0;
  v_fee bigint := 0;
  v_rec record;
  v_available bigint;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    if p_company_id not in (select public.current_company_ids())
       or not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Sem permissão para este saldo.' using errcode = '42501';
    end if;
  end if;

  with sales as (
    select p.paid_at, p.partner_release_at,
           coalesce((select sum((r->>'amount')::int) from jsonb_array_elements(p.split) r
                      where public.split_rule_is_partner(r)), 0)::bigint
           - coalesce(p.debt_recovered_cents, 0)
           - (case when coalesce((select bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                                   from jsonb_array_elements(p.split) r where public.split_rule_is_partner(r)), false)
                   then coalesce(p.gateway_fee_cents, 0) else 0 end)
           - coalesce(p.refund_partner_cents, 0) as net_cents,
           -- Fração estornada que a Movepark pagou do master: o dinheiro dessa venda já ficou com o
           -- parceiro e virou dívida. Segurar isso "pelo prazo" não protege ninguém (o cliente já foi
           -- reembolsado), então libera na hora e a dívida abate em seguida. Sem isso a tela mostrava
           -- uma venda cancelada como "retida pelo prazo".
           (case when p.refund_absorbed_by_master is true and p.amount > 0
                 then least(1::numeric, coalesce(p.refunded_amount, 0) / p.amount) else 0::numeric end) as master_ratio
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where l.company_id = p_company_id and p.provider = 'pagarme' and p.kind in ('booking', 'date_change')
       and p.status in ('paid', 'refunded') and p.paid_at is not null and p.split_sent_to_gateway is true
  )
  select coalesce(sum(case when public.payout_sale_released(paid_at, partner_release_at, v_days, now())
                           then net_cents else round(net_cents * master_ratio) end), 0),
         coalesce(sum(case when public.payout_sale_released(paid_at, partner_release_at, v_days, now())
                           then 0 else net_cents - round(net_cents * master_ratio) end), 0)
    into v_released, v_retained
    from sales where net_cents > 0;

  select coalesce(sum(t.amount_cents), 0) into v_transfers_in
    from public.payout_transfer t where t.company_id = p_company_id and t.status = 'paid' and t.deleted_at is null;

  -- Saques pedidos (pagos ou em curso) COM a taxa que cada um custou: é aqui que a taxa entra no
  -- razão, no momento do saque, nunca antes.
  select coalesce(sum(w.amount_cents + case when w.fee_borne_by = 'movepark' then 0 else w.fee_cents end), 0) into v_withdrawn
    from public.payout_withdrawal w
   where w.company_id = p_company_id and w.deleted_at is null and w.status in ('created', 'processing', 'paid');

  v_debt := public.payout_debt_cents(p_company_id);
  v_fee := coalesce((select nullif(trim(s.value), '')::bigint from public.app_setting s where s.key = 'payout_withdrawal_fee_cents'), 0);

  select r.balance_available_cents, r.balance_waiting_cents, r.balance_synced_at, r.status::text as status,
         r.gateway_missing_at is not null as missing
    into v_rec
    from public.payout_recipient r
   where r.company_id = p_company_id and r.provider = 'pagarme' and r.deleted_at is null
   limit 1;

  v_available := greatest(0, least(
    v_released + v_transfers_in - v_debt - v_withdrawn,
    coalesce(v_rec.balance_available_cents, 0)
  ));

  return jsonb_build_object(
    'company_id', p_company_id,
    'release_days', v_days,
    'released_cents', v_released + v_transfers_in,
    'retained_cents', v_retained,
    'debt_cents', v_debt,
    'withdrawn_cents', v_withdrawn,
    'gateway_available_cents', v_rec.balance_available_cents,
    'gateway_waiting_cents', v_rec.balance_waiting_cents,
    'gateway_synced_at', v_rec.balance_synced_at,
    'recipient_status', v_rec.status,
    'recipient_missing', coalesce(v_rec.missing, false),
    'fee_credit_cents', public.payout_fee_credit_cents(p_company_id),
    'available_cents', v_available,
    -- Informativa: cobrada do recebedor no ato do saque, nunca descontada daqui.
    'withdrawal_fee_cents', v_fee,
    'max_withdraw_cents', v_available
  );
end;
$function$;

-- payout_auto_forecast
CREATE OR REPLACE FUNCTION public.payout_auto_forecast(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_days int := public.payout_release_days(p_company_id);
  v_next date := public.payout_next_auto_at(p_company_id);
  v_run_at timestamptz;
  v_released bigint := 0; v_transfers_in bigint := 0; v_withdrawn bigint := 0; v_debt bigint := 0;
  v_rec record; v_last record; v_forecast bigint; v_min bigint := public.payout_auto_min_cents();
  v_company_day int;
begin
  if not (public.is_hub_admin() or coalesce(auth.role(), '') = 'service_role') then
    if p_company_id not in (select public.current_company_ids())
       or not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Sem permissão para esta previsão.' using errcode = '42501';
    end if;
  end if;
  -- O ciclo deste mês já rodou: a próxima data é a do mês seguinte.
  if exists (select 1 from public.payout_auto_cycle y where y.company_id = p_company_id
              and y.cycle_month = date_trunc('month', v_next)::date and y.outcome <> 'running') then
    v_next := public.payout_next_auto_at(p_company_id, (date_trunc('month', v_next) + interval '1 month')::date);
  end if;
  -- O instante do repasse (9h de Brasília), não o fim do dia: venda que completa o prazo à tarde
  -- do dia do repasse fica para o mês seguinte, e a previsão tem que dizer isso.
  v_run_at := public.payout_auto_run_at(v_next);

  with sales as (
    select p.paid_at, p.partner_release_at,
           coalesce((select sum((r->>'amount')::int) from jsonb_array_elements(p.split) r
                      where public.split_rule_is_partner(r)), 0)::bigint
           - coalesce(p.debt_recovered_cents, 0)
           - (case when coalesce((select bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                                   from jsonb_array_elements(p.split) r where public.split_rule_is_partner(r)), false)
                   then coalesce(p.gateway_fee_cents, 0) else 0 end)
           - coalesce(p.refund_partner_cents, 0) as net_cents,
           (case when p.refund_absorbed_by_master is true and p.amount > 0
                 then least(1::numeric, coalesce(p.refunded_amount, 0) / p.amount) else 0::numeric end) as master_ratio
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where l.company_id = p_company_id and p.provider = 'pagarme' and p.kind in ('booking', 'date_change')
       and p.status in ('paid', 'refunded') and p.paid_at is not null and p.split_sent_to_gateway is true
  )
  select coalesce(sum(case when public.payout_sale_released(paid_at, partner_release_at, v_days, v_run_at)
                           then net_cents else round(net_cents * master_ratio) end), 0)
    into v_released from sales where net_cents > 0;
  select coalesce(sum(t.amount_cents), 0) into v_transfers_in
    from public.payout_transfer t where t.company_id = p_company_id and t.status = 'paid' and t.deleted_at is null;
  select coalesce(sum(w.amount_cents + case when w.fee_borne_by = 'movepark' then 0 else w.fee_cents end), 0) into v_withdrawn
    from public.payout_withdrawal w
   where w.company_id = p_company_id and w.deleted_at is null and w.status in ('created', 'processing', 'paid');
  v_debt := public.payout_debt_cents(p_company_id);
  select r.balance_available_cents, r.balance_waiting_cents, r.status::text as status, r.gateway_missing_at is not null as missing
    into v_rec from public.payout_recipient r
   where r.company_id = p_company_id and r.provider = 'pagarme' and r.deleted_at is null limit 1;
  v_forecast := greatest(0, least(
    v_released + v_transfers_in - v_debt - v_withdrawn,
    coalesce(v_rec.balance_available_cents, 0) + coalesce(v_rec.balance_waiting_cents, 0)));
  select y.cycle_month, y.outcome, y.amount_cents, y.available_cents, y.ran_at, y.reason into v_last
    from public.payout_auto_cycle y where y.company_id = p_company_id order by y.cycle_month desc limit 1;
  select c.payout_auto_day into v_company_day from public.company c where c.id = p_company_id;

  return jsonb_build_object(
    'company_id', p_company_id,
    'enabled', public.payout_auto_enabled(p_company_id),
    'day', public.payout_auto_day(p_company_id),
    'source', case when v_company_day is not null then 'company' else 'global' end,
    'next_at', v_next,
    'run_at', v_run_at,
    'forecast_cents', v_forecast,
    'min_cents', v_min,
    'below_min', v_forecast < v_min,
    'recipient_status', v_rec.status,
    'recipient_missing', coalesce(v_rec.missing, false),
    'last_cycle', case when v_last.cycle_month is null then null else jsonb_build_object(
      'cycle_month', v_last.cycle_month, 'outcome', v_last.outcome, 'amount_cents', v_last.amount_cents,
      'available_cents', v_last.available_cents, 'ran_at', v_last.ran_at, 'reason', v_last.reason) end);
end $function$;

-- payout_statement
CREATE OR REPLACE FUNCTION public.payout_statement(p_from timestamp with time zone, p_to timestamp with time zone, p_company_id uuid DEFAULT NULL::uuid, p_include_lines boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean := public.is_hub_admin();
  v_result   jsonb;
begin
  if not v_is_admin then
    if p_company_id is null or p_company_id not in (select public.current_company_ids()) then
      raise exception 'Sem permissão para este extrato.' using errcode = '42501';
    end if;
    if not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Seu papel não permite ver o financeiro (finance:read).' using errcode = '42501';
    end if;
  end if;

  with legs as (
    select
      loc.company_id,
      c.name as company_name,
      p.status::text as status,
      b.code as booking_code,
      coalesce(p.paid_at, p.refunded_at) as event_at,
      -- Só `booking` tem perna de parceiro. A perna é identificada por `role` (regras antigas: por
      -- `liable`, que era a marca do parceiro até o split dinâmico).
      coalesce(sum((r->>'amount')::int)
        filter (where public.split_rule_is_partner(r) and p.kind in ('booking', 'date_change')), 0) as partner_cents,
      coalesce(sum((r->>'amount')::int)
        filter (where not public.split_rule_is_partner(r) or p.kind not in ('booking', 'date_change')), 0) as movepark_cents,
      -- Estorno parcial: o pagamento continua `paid`, então o desconto tem que vir daqui.
      case
        when p.status = 'paid' and coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then least(1::numeric, p.refunded_amount / p.amount)
        else 0::numeric
      end as refund_ratio,
      -- Troca de datas (17/11/2026): a parte das diárias devolvidas sai inteira da perna do
      -- estacionamento; a tarifa nunca volta. Sem estorno de datas é a mesma proporção acima.
      case
        when p.status = 'paid' and coalesce(p.refunded_amount, 0) > 0 and p.amount > 0
          then public.payment_partner_refund_ratio(p.amount, p.refunded_amount, p.date_change_refunded_cents, p.date_change_partner_refund_frac)
        else 0::numeric
      end as partner_refund_ratio,
      round(coalesce(p.refunded_amount, 0) * 100)::bigint as refunded_cents,
      coalesce(p.date_change_refunded_cents, 0) as dc_refunded_cents,
      -- Custo da Movepark, apurado em `GET /payables`. Nulo (não apurado) soma nada.
      coalesce(p.gateway_fee_cents, 0) as gateway_fee_cents,
      -- Abatimento de dívida gravado NESTA cobrança (split dinâmico). A perna do parceiro acima é a
      -- normal; o que ele recebeu de fato é perna menos abatimento.
      coalesce(p.debt_recovered_cents, 0) as debt_recovered_cents,
      -- Estorno híbrido (E0.3.6): quem devolveu. `refund_partner_cents` é o que o gateway debitou
      -- do parceiro; `refund_absorbed_by_master` marca o que a Movepark pagou (vira dívida).
      coalesce(p.refund_partner_cents, 0) as refund_partner_cents,
      p.refund_absorbed_by_master as refund_absorbed_by_master
    from public.payment p
    join public.booking b    on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    join public.company c    on c.id = loc.company_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = 'pagarme'
      and p.status in ('paid', 'refunded')
      and coalesce(p.paid_at, p.refunded_at) >= p_from
      and coalesce(p.paid_at, p.refunded_at) < p_to
      and (p_company_id is null or loc.company_id = p_company_id)
      and (v_is_admin or loc.company_id in (select public.current_company_ids()))
    group by loc.company_id, c.name, p.id, p.status, b.code, p.paid_at, p.refunded_at,
             p.kind, p.amount, p.refunded_amount, p.gateway_fee_cents, p.debt_recovered_cents,
             p.refund_partner_cents, p.refund_absorbed_by_master
  ),
  lines as (
    select
      l.*,
      round(l.partner_cents  * l.partner_refund_ratio)::bigint as partner_partial_cents,
      (l.partner_cents  - round(l.partner_cents  * l.partner_refund_ratio))::bigint as partner_net_cents,
      (case when l.dc_refunded_cents > 0
            then l.movepark_cents - greatest(0, l.refunded_cents - round(l.partner_cents * l.partner_refund_ratio))
            else l.movepark_cents - round(l.movepark_cents * l.refund_ratio) end)::bigint as movepark_net_cents
    from legs l
  ),
  agg as (
    select
      company_id, company_name,
      coalesce(sum(partner_cents), 0)                                    as gross_partner_cents,
      coalesce(sum(partner_cents) filter (where status = 'refunded'), 0)
        + coalesce(sum(partner_partial_cents) filter (where status = 'paid'), 0)
                                                                         as refunded_partner_cents,
      coalesce(sum(partner_net_cents)  filter (where status = 'paid'), 0) as net_partner_cents,
      coalesce(sum(movepark_net_cents) filter (where status = 'paid'), 0) as movepark_commission_cents,
      coalesce(sum(gateway_fee_cents)  filter (where status = 'paid'), 0) as gateway_fee_cents,
      count(*) filter (where status = 'paid')                            as paid_count,
      count(*) filter (where status = 'refunded')                        as refunded_count,
      -- Dos estornos, quanto o gateway debitou do próprio parceiro (não virou dívida).
      coalesce(sum(refund_partner_cents), 0)                             as refunded_by_partner_cents
    from lines
    group by company_id, company_name
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'companies', coalesce(jsonb_agg(
      jsonb_build_object(
        'company_id', a.company_id,
        'company_name', a.company_name,
        'gross_partner_cents', a.gross_partner_cents,
        'refunded_partner_cents', a.refunded_partner_cents,
        'net_partner_cents', a.net_partner_cents,
        'movepark_commission_cents', a.movepark_commission_cents,
        'gateway_fee_cents', a.gateway_fee_cents,
        'paid_count', a.paid_count,
        'refunded_count', a.refunded_count,
        'refunded_by_partner_cents', a.refunded_by_partner_cents,
        'lines', case when p_include_lines then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'booking_code', l.booking_code,
            'event_at', l.event_at,
            'status', l.status,
            -- A linha mostra o que sobrou de verdade: já líquido do estorno parcial.
            'partner_cents', l.partner_net_cents,
            'movepark_cents', l.movepark_net_cents,
            'gateway_fee_cents', l.gateway_fee_cents,
            'debt_recovered_cents', l.debt_recovered_cents,
            'refund_partner_cents', l.refund_partner_cents,
            'refund_absorbed_by_master', l.refund_absorbed_by_master
          ) order by l.event_at desc), '[]'::jsonb)
          from lines l where l.company_id = a.company_id
        ) else null end
      ) order by a.company_name
    ), '[]'::jsonb)
  ) into v_result
  from agg a;

  return v_result;
end;
$function$;

-- partner_account_statement
CREATE OR REPLACE FUNCTION public.partner_account_statement(p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin boolean := public.is_hub_admin();
  v_rec record;
  v_moves jsonb;
  -- Prazo de saque da empresa (E0.3.8): o mesmo que `payout_withdrawable` usa para liberar.
  v_days int := public.payout_release_days(p_company_id);
begin
  if not v_admin then
    if p_company_id not in (select public.current_company_ids())
       or not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Sem permissão para este extrato.' using errcode = '42501';
    end if;
  end if;

  select r.status::text as status, r.external_recipient_id, r.gateway_missing_at,
         r.balance_available_cents, r.balance_waiting_cents, r.balance_transferred_cents, r.balance_synced_at,
         r.transfer_enabled, r.transfer_interval, r.transfer_day
    into v_rec
    from public.payout_recipient r
   where r.company_id = p_company_id and r.provider = 'pagarme' and r.deleted_at is null
   limit 1;

  with sales as (
    select p.id, b.code, p.paid_at, p.refunded_at, p.amount, p.refunded_amount, p.partner_release_at,
           coalesce(p.debt_recovered_cents, 0)::bigint as debt_recovered_cents,
           p.gateway_fee_cents, coalesce(p.refund_partner_cents, 0)::bigint as refund_partner_cents,
           p.refund_absorbed_by_master, p.refund_reason, p.split_sent_to_gateway, p.chargeback_debt_cents,
           coalesce(p.fee_credit_returned_cents, 0)::bigint as fee_credit_returned_cents,
           coalesce(p.anticipation_comp_cents, 0)::bigint as anticipation_comp_cents,
           coalesce(p.anticipation_fee_partner_cents, 0)::bigint as anticipation_fee_partner_cents,
           p.anticipation_reread_at,
           coalesce(p.date_change_refunded_cents, 0) as dc_refunded_cents,
           coalesce(p.date_change_partner_refund_frac, 0) as dc_partner_frac,
           coalesce((select sum((r->>'amount')::int) from jsonb_array_elements(p.split) r
                      where public.split_rule_is_partner(r)), 0)::bigint as partner_cents,
           coalesce((select bool_or(coalesce((r->>'chargeProcessingFee')::boolean, false))
                       from jsonb_array_elements(p.split) r where public.split_rule_is_partner(r)), false) as partner_pays_fee
      from public.payment p
      join public.booking b on b.id = p.booking_id
      join public.location l on l.id = b.location_id
     where l.company_id = p_company_id and p.provider = 'pagarme' and p.kind in ('booking', 'date_change')
       and p.status in ('paid', 'refunded') and p.paid_at is not null
  ),
  moves as (
    -- Venda: a parte do parceiro entrou no recebedor dele (líquida da taxa e do abatimento).
    select 'sale'::text as kind, s.paid_at as at, s.code as booking_code,
           s.partner_cents as gross_cents,
           (case when s.partner_pays_fee then coalesce(s.gateway_fee_cents, 0) else 0 end)::bigint as fee_cents,
           s.debt_recovered_cents,
           (s.partner_cents - s.debt_recovered_cents
              - case when s.partner_pays_fee then coalesce(s.gateway_fee_cents, 0) else 0 end)::bigint as net_cents,
           (-s.debt_recovered_cents)::bigint as debt_delta_cents,
           -- Quando a venda entra no disponível para saque: a MAIOR entre a data em que a Pagar.me
           -- libera o recebível e `pagamento + prazo de saque da empresa`. É a mesma conta do
           -- `payout_withdrawable`; antes o extrato olhava só o gateway e dizia "liberado" para um
           -- PIX do dia, que a regra de saque ainda segurava por 30 dias. A data existe desde o
           -- pagamento: enquanto o gateway não informou a dele, vale o prazo da empresa.
           greatest(coalesce(s.partner_release_at, s.paid_at), s.paid_at + make_interval(days => v_days)) as release_at,
           case
             -- Estorno que a Movepark absorveu inteira: nada a segurar, a dívida abate em seguida.
             when s.refund_absorbed_by_master is true and coalesce(s.refunded_amount, 0) >= s.amount then 'released'
             when greatest(coalesce(s.partner_release_at, s.paid_at), s.paid_at + make_interval(days => v_days)) > now() then 'waiting'
             -- O prazo passou mas o gateway ainda não informou a data dele: o saque segue segurando.
             when s.partner_release_at is null then 'unknown'
             else 'released' end as release_status,
           null::text as origin, null::text as status, null::text as note
      from sales s
     where s.split_sent_to_gateway is true and s.partner_cents > 0
    union all
    -- Venda em custódia (18/09/2026): a cobrança foi SEM split e o valor caiu inteiro na Movepark.
    -- Não mexe no saldo do recebedor, mas é venda do estacionamento e precisa estar na conta; o
    -- valor chega depois por repasse. O cancelamento dela também aparece, com efeito zero.
    select 'custody_sale', s.paid_at, s.code, s.partner_cents, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
           null::timestamptz, null::text, null::text, null::text, 'em custódia com a Movepark'
      from sales s
     where s.split_sent_to_gateway is not true and s.partner_cents > 0
    union all
    select 'custody_refund', s.refunded_at, s.code,
           (-(round(s.partner_cents * public.payment_partner_refund_ratio(s.amount, s.refunded_amount, s.dc_refunded_cents, s.dc_partner_frac))))::bigint,
           0::bigint, 0::bigint, 0::bigint, 0::bigint,
           null::timestamptz, null::text, null::text, null::text, s.refund_reason
      from sales s
     where s.refunded_at is not null and s.split_sent_to_gateway is not true and s.partner_cents > 0
       and coalesce(s.refunded_amount, 0) > 0
    union all
    -- Estorno: se o gateway debitou o parceiro, sai do saldo dele; se a Movepark absorveu, o saldo
    -- dele não muda e a parte vira dívida.
    select case when s.refund_partner_cents > 0 then 'refund' else 'debt' end,
           s.refunded_at, s.code,
           (-(round(s.partner_cents * public.payment_partner_refund_ratio(s.amount, s.refunded_amount, s.dc_refunded_cents, s.dc_partner_frac))))::bigint,
           0::bigint, 0::bigint,
           (case when s.refund_partner_cents > 0 then -s.refund_partner_cents else 0 end)::bigint,
           -- Dívida líquida da taxa que o parceiro pagou: ele devolve o que recebeu.
           -- Chargeback com regra de comissão (E0.3.12): a dívida é a que a regra mandou gravar.
           (case when s.refund_partner_cents > 0 then 0
                 else coalesce(s.chargeback_debt_cents::numeric,
                        round(greatest(s.partner_cents
                              - case when s.partner_pays_fee then coalesce(s.gateway_fee_cents, 0) else 0 end, 0)
                            * public.payment_partner_refund_ratio(s.amount, s.refunded_amount, s.dc_refunded_cents, s.dc_partner_frac))) end)::bigint,
           null::timestamptz, null::text,
           case when s.refund_partner_cents > 0 then 'partner' else 'master' end,
           null::text,
           case when s.chargeback_debt_cents = 0 then 'chargeback absorvido pela Movepark (regra de comissão da venda)'
                when s.chargeback_debt_cents > 0 then 'chargeback por conta do estacionamento (regra de comissão da venda)'
                else s.refund_reason end
      from sales s
     where s.refunded_at is not null and s.split_sent_to_gateway is true and s.partner_cents > 0
       and (s.refund_absorbed_by_master is true or s.refund_partner_cents > 0)
    union all
    -- Acerto manual de dívida (o parceiro pagou por fora, ou ajuste).
    select 'settlement', d.created_at, null, d.amount_cents::bigint, 0::bigint, 0::bigint, 0::bigint,
           (-d.amount_cents)::bigint, null, null, null, d.kind, d.note
      from public.payout_debt_settlement d
     where d.company_id = p_company_id and d.deleted_at is null
    union all
    -- Repasse da custódia (Movepark para o recebedor dele).
    select 'transfer_in', coalesce(t.paid_at, t.requested_at), null, t.amount_cents::bigint, 0::bigint, 0::bigint,
           t.amount_cents::bigint, 0::bigint, null, null, null, t.status::text, null
      from public.payout_transfer t
     where t.company_id = p_company_id and t.deleted_at is null
    union all
    -- Saque (do recebedor para a conta bancária dele). A data do movimento é a do pedido: o dinheiro
    -- sai do recebedor na hora; quando cai no banco vai em release_at (E0.3.10).
    select 'withdrawal', coalesce(w.requested_at, w.created_at), null, (-w.amount_cents)::bigint,
           w.fee_cents::bigint, 0::bigint, (-(w.amount_cents + w.fee_cents))::bigint, 0::bigint,
           coalesce(w.paid_at, w.expected_at),
           case when w.status = 'paid' then 'released'
                when w.status in ('failed', 'canceled') then null
                when w.expected_at is not null then 'waiting' else 'unknown' end,
           w.origin, w.status::text,
           case when w.origin = 'automatic' then 'repasse automático · taxa por conta da Movepark' else w.failure_reason end
      from public.payout_withdrawal w
     where w.company_id = p_company_id and w.deleted_at is null
    union all
    -- Devolução da taxa do repasse automático (E0.3.13): a Movepark cedeu ao parceiro, no split desta venda.
    select 'fee_credit', s.paid_at, s.code, s.fee_credit_returned_cents, 0::bigint, 0::bigint,
           s.fee_credit_returned_cents, 0::bigint, null, null, null, null,
           'taxa do repasse automático devolvida pela Movepark'
      from sales s where s.fee_credit_returned_cents > 0
    union all
    -- Antecipação do cartão (E0.3.14): o que a Movepark mandou a mais no split para cobrir a taxa.
    select 'anticipation_comp', s.paid_at, s.code, s.anticipation_comp_cents, 0::bigint, 0::bigint,
           s.anticipation_comp_cents, 0::bigint, null, null, null, null,
           'compensação da antecipação paga pela Movepark'
      from sales s where s.anticipation_comp_cents > 0 and s.split_sent_to_gateway is true
    union all
    -- A taxa que a Pagar.me descontou do recebedor dele ao antecipar, apurada na releitura (~D+31).
    select 'anticipation_fee', s.anticipation_reread_at, s.code, 0::bigint, s.anticipation_fee_partner_cents, 0::bigint,
           (-s.anticipation_fee_partner_cents)::bigint, 0::bigint, null, null, null, null,
           'taxa da antecipação do cartão'
      from sales s where s.anticipation_fee_partner_cents > 0 and s.anticipation_reread_at is not null
    union all
    -- Antecipação pontual ("Antecipar agora"). Paga pela Movepark, a taxa volta como crédito.
    select 'anticipation_spot', coalesce(a.payment_date, a.created_at), null, 0::bigint,
           coalesce(a.anticipation_fee_cents, 0)::bigint, 0::bigint,
           (-coalesce(a.anticipation_fee_cents, 0))::bigint, 0::bigint, a.payment_date,
           case when a.status = 'approved' then 'released' when a.status in ('refused', 'canceled') then null else 'waiting' end,
           a.fee_borne_by, a.status,
           case when a.fee_borne_by = 'movepark' then 'taxa paga pela Movepark: volta como crédito na próxima venda'
                else 'taxa paga pelo estacionamento' end
      from public.payout_anticipation a
     where a.company_id = p_company_id and a.deleted_at is null and a.status in ('pending', 'pre_approved', 'approved')
  )
  -- Canal da venda (E0.3.12): a movimentação de reserva que veio por regra de comissão leva o nome
  -- do canal e o percentual, para a origem ser reconhecida sem abrir a reserva.
  select coalesce(jsonb_agg(
           to_jsonb(m) || coalesce((
             select jsonb_build_object('commission_channel', bk.commission_channel,
                                       'commission_take_rate_bps', bk.commission_take_rate_bps)
               from public.booking bk
              where bk.code = m.booking_code and bk.commission_rule_id is not null
              limit 1), '{}'::jsonb)
           order by m.at desc), '[]'::jsonb) into v_moves
    from moves m
   where m.at >= p_from and m.at < p_to;

  return jsonb_build_object(
    'company_id', p_company_id,
    'header', jsonb_build_object(
      'recipient_status', v_rec.status,
      'external_recipient_id', v_rec.external_recipient_id,
      'recipient_missing', v_rec.gateway_missing_at is not null,
      'available_cents', v_rec.balance_available_cents,
      'waiting_cents', v_rec.balance_waiting_cents,
      'transferred_cents', v_rec.balance_transferred_cents,
      'balance_synced_at', v_rec.balance_synced_at,
      'transfer_enabled', v_rec.transfer_enabled,
      'transfer_interval', v_rec.transfer_interval,
      'transfer_day', v_rec.transfer_day,
      'debt_cents', public.payout_debt_cents(p_company_id)
    ),
    'movements', v_moves
  );
end;
$function$;
