-- E2.8-h (Fase B, B1) · Alterar datas de reserva PAGA: base de schema + cotação (dry-run).
-- Aqui só o que NÃO muda estado: (1) o `payment.kind` ganha 'date_change' e as colunas que guardam
-- as datas-alvo de uma cobrança de delta pendente; (2) `reprice_booking_dates`, uma cotação read-only
-- que devolve o novo total, o delta e se as novas datas têm disponibilidade, SEM tocar na reserva.
-- O apply (re-segurar capacidade + mover datas) e o fluxo de pagamento entram no B2.
-- Ver docs/specs/booking-modifications.md (Fase B).

-- 'date_change' = cobrança do delta ao adiar/alongar uma reserva já paga (aplica no webhook).
alter table public.payment drop constraint if exists payment_kind_check;
alter table public.payment
  add constraint payment_kind_check check (kind in ('booking', 'fare_upgrade', 'date_change'));

-- Datas-alvo de uma cobrança de delta de troca de datas (só quando kind='date_change').
alter table public.payment
  add column if not exists date_change_check_in_at  timestamptz,
  add column if not exists date_change_check_out_at timestamptz;

comment on column public.payment.date_change_check_in_at is
  'kind=date_change: novo check-in a aplicar quando a cobrança do delta for paga (E2.8-h).';

-- Cotação read-only de uma troca de datas: re-precifica as novas datas e devolve o delta vs. o total
-- atual, mais a disponibilidade. NÃO muda nada (nem capacidade, nem preço). É a base do "quanto custa
-- a diferença" no front e no Edge antes de decidir cobrar/estornar.
create or replace function public.reprice_booking_dates(
  p_booking_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  v_status public.booking_status; v_location_id uuid; v_fare_tier public.fare_tier; v_fare_cents int;
  v_current_total numeric; v_pt uuid; v_lpt_id uuid; v_capacity int;
  v_company_slug text; v_location_slug text; v_pt_code text; v_cpt_id uuid;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes numeric; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_available boolean := true; v_reason text := null;
  v_sim jsonb; v_price numeric; v_base numeric; v_subtotal numeric;
  v_auto_discount numeric := 0; v_disc record; v_addons numeric; v_fare_price numeric; v_new_total numeric;
begin
  select status, location_id, fare_tier, fare_price_cents, total_amount
    into v_status, v_location_id, v_fare_tier, v_fare_cents, v_current_total
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

  -- Validações de política (viram "indisponível" com motivo, não exceção — é uma cotação).
  if v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
    v_available := false; v_reason := 'Estadia mínima não atingida para essa vaga.';
  elsif v_has_min_date and v_min_date is not null and p_check_in::date < v_min_date then
    v_available := false; v_reason := 'Data de entrada antes da data mínima permitida.';
  elsif v_advance_min is not null and p_check_in < now() + (v_advance_min || ' minutes')::interval then
    v_available := false; v_reason := 'Reserva exige antecedência mínima.';
  else
    -- Disponibilidade read-only (sem FOR UPDATE, sem alterar booked_count).
    for v_date in
      select generate_series(p_check_in::date, (p_check_out - interval '1 microsecond')::date, '1 day')::date
    loop
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

  -- Novo preço da vaga (mesma lógica de change_booking_dates: simulate_price + desconto automático).
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

  -- Tarifa: preço inalterado numa troca de datas (a flexibilidade já foi comprada).
  v_fare_price := coalesce(v_fare_cents, 0) / 100.0;
  v_new_total := v_subtotal + v_addons + v_fare_price;

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'days', v_days,
    'current_total_cents', round(coalesce(v_current_total, 0) * 100)::int,
    'new_total_cents', round(v_new_total * 100)::int,
    'delta_cents', round((v_new_total - coalesce(v_current_total, 0)) * 100)::int,
    'available', v_available,
    'reason', v_reason
  );
end; $fn$;

revoke all on function public.reprice_booking_dates(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.reprice_booking_dates(uuid, timestamptz, timestamptz) to service_role;
