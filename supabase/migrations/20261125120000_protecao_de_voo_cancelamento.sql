-- Proteção de voo: atraso ou cancelamento (25/09/2026).
-- Spec: docs/superpowers/specs/2026-09-25-protecao-de-voo-cancelamento-design.md
--
-- A RPC passa a receber a saída PEDIDA (sem teto) e separa: coberta (até +24h, capacidade segurada,
-- crédito ao parceiro pago pela Movepark) e excedente (previsão com a diária congelada, cobrada no
-- balcão pelo parceiro, 100% dele). O Operator registra a saída real no check-out e o que cobrou.

alter table public.booking_fare_extension
  add column if not exists kind text not null default 'delay' check (kind in ('delay', 'cancellation')),
  add column if not exists requested_check_out_at timestamptz,
  add column if not exists overage_daily_cents integer not null default 0,
  add column if not exists overage_cents integer not null default 0,
  add column if not exists actual_check_out_at timestamptz,
  add column if not exists overage_charged_cents integer,
  add column if not exists overage_note text,
  add column if not exists overage_recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists overage_recorded_at timestamptz;

-- O estacionamento precisa ler a extensão para ver o aviso e registrar a saída real.
drop policy if exists booking_fare_extension_company_select on public.booking_fare_extension;
create policy booking_fare_extension_company_select on public.booking_fare_extension
  for select to authenticated
  using (exists (
    select 1 from public.booking b join public.location l on l.id = b.location_id
     where b.id = booking_fare_extension.booking_id and public.member_has_scope(l.company_id, 'bookings:read')));

-- Excedente em dias inteiros além da saída coberta (arredonda para cima). Zero quando sai antes.
create or replace function public.flight_overage_days(p_covered timestamptz, p_actual timestamptz)
returns integer language sql immutable as $$
  select greatest(0, ceil(extract(epoch from (p_actual - p_covered)) / 86400))::int;
$$;

drop function if exists public.extend_booking_flight_delay(uuid, timestamptz, text, text, text);
create or replace function public.extend_booking_flight_delay(
  p_booking_id uuid, p_new_check_out_at timestamptz, p_actor text default 'system',
  p_reason text default null, p_flight_number text default null, p_kind text default 'delay')
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_status public.booking_status; v_check_in timestamptz; v_check_out timestamptz;
  v_location_id uuid; v_benefits jsonb; v_pt uuid; v_code text; v_company_id uuid;
  v_lpt_id uuid; v_cap int; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_added int := 0;
  v_max_hours int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'flight_extension_max_hours'), 24);
  v_after_min int := coalesce((select nullif(trim(value), '')::int from public.app_setting where key = 'flight_extension_after_checkout_minutes'), 120);
  v_flight text := nullif(upper(trim(coalesce(p_flight_number, ''))), '');
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'delay');
  v_company_slug text; v_location_slug text; v_pt_code text; v_take int;
  v_days int; v_price_before numeric; v_price_after numeric; v_credit int := 0; v_settlement uuid;
  v_covered timestamptz; v_daily int := 0; v_overage int := 0;
begin
  if v_kind not in ('delay', 'cancellation') then
    raise exception 'Motivo inválido: use atraso ou cancelamento.' using errcode = 'P0001';
  end if;
  select status, check_in_at, check_out_at, location_id, fare_benefits, code, coalesce(commission_take_rate_bps, -1)
    into v_status, v_check_in, v_check_out, v_location_id, v_benefits, v_code, v_take
  from public.booking where id = p_booking_id and deleted_at is null for update;
  if v_status is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if not coalesce((v_benefits ->> 'flight_delay_protection')::boolean, false) then
    raise exception 'Proteção de voo disponível só na Tarifa Superflex.' using errcode = 'P0001';
  end if;
  if v_status not in ('confirmed', 'checked_in') then
    raise exception 'Só reservas confirmadas ou em andamento podem ser estendidas.' using errcode = 'P0001';
  end if;
  if v_flight is null then raise exception 'Informe o número do voo para acionar a proteção.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.booking_fare_extension where booking_id = p_booking_id) then
    raise exception 'A proteção de voo já foi usada nesta reserva.' using errcode = 'P0001';
  end if;
  if now() > v_check_out + make_interval(mins => v_after_min) then
    raise exception 'A proteção só pode ser acionada até % minutos depois da saída prevista.', v_after_min using errcode = 'P0001';
  end if;
  if p_new_check_out_at <= v_check_out then
    raise exception 'A nova saída precisa ser depois da saída atual.' using errcode = 'P0001';
  end if;

  -- Coberta: até 24h por conta da Movepark. O resto é excedente (previsão, sem capacidade).
  v_covered := least(p_new_check_out_at, v_check_out + make_interval(hours => v_max_hours));

  select bi.parking_type_id into v_pt from public.booking_item bi where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  select lpt.id, lpt.capacity, c.slug, l.slug, pt.code, c.id, case when v_take >= 0 then v_take else c.take_rate_bps end
    into v_lpt_id, v_cap, v_company_slug, v_location_slug, v_pt_code, v_company_id, v_take
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt limit 1;
  if v_lpt_id is null then raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001'; end if;

  for v_date in
    select generate_series((v_check_out - interval '1 microsecond')::date + 1, (v_covered - interval '1 microsecond')::date, '1 day')::date
  loop
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0) on conflict (location_parking_type_id, date) do nothing;
    select booked_count, blocked, external_booked_count into v_booked, v_blocked, v_external
    from public.location_parking_availability where location_parking_type_id = v_lpt_id and date = v_date for update;
    if v_blocked then raise exception 'Data % indisponível (bloqueada pelo estacionamento).', v_date using errcode = 'P0001'; end if;
    if v_booked + coalesce(v_external, 0) >= v_cap then raise exception 'Sem disponibilidade para estender até %.', v_date using errcode = 'P0001'; end if;
    update public.location_parking_availability set booked_count = booked_count + 1 where location_parking_type_id = v_lpt_id and date = v_date;
    v_added := v_added + 1;
  end loop;

  -- Diária cheia da unidade pelo motor (o que o balcão cobra), congelada para o excedente. Sem
  -- tabela de preço, fica zero e a extensão segue (a Movepark não inventa preço).
  v_days := greatest(1, ceil(extract(epoch from (v_check_out - v_check_in)) / 86400)::int);
  begin
    v_price_before := (public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days) ->> 'price')::numeric;
    v_price_after  := (public.simulate_price(v_company_slug, v_location_slug, v_pt_code, v_days + greatest(v_added, 1)) ->> 'price')::numeric;
  exception when others then
    v_price_before := null; v_price_after := null;
  end;
  if v_price_before is not null and v_price_after is not null and v_price_after > v_price_before then
    v_daily := round((v_price_after - v_price_before) * 100 / greatest(v_added, 1))::int;
  end if;
  -- As 24h cobertas: crédito ao parceiro pela parte dele (Q-027), pago pela Movepark.
  if v_added > 0 and v_daily > 0 then
    v_credit := round(v_daily * v_added * (10000 - coalesce(v_take, 0)) / 10000.0)::int;
    insert into public.payout_debt_settlement (company_id, provider, amount_cents, kind, note)
    values (v_company_id, 'pagarme', v_credit, 'flight_extension_credit',
            format('Proteção de voo (%s) da reserva %s: %s diária(s) pagas pela Movepark',
                   case when v_kind = 'cancellation' then 'cancelamento' else 'atraso' end, v_code, v_added))
    returning id into v_settlement;
  end if;
  v_overage := public.flight_overage_days(v_covered, p_new_check_out_at) * v_daily;

  update public.booking set check_out_at = v_covered, flight_number = coalesce(flight_number, v_flight) where id = p_booking_id;
  insert into public.booking_fare_extension (booking_id, old_check_out_at, new_check_out_at, added_days, actor, reason, flight_number,
    partner_credit_cents, settlement_id, kind, requested_check_out_at, overage_daily_cents, overage_cents)
  values (p_booking_id, v_check_out, v_covered, v_added, coalesce(p_actor, 'system'), p_reason, v_flight,
    v_credit, v_settlement, v_kind, p_new_check_out_at, v_daily, v_overage);
  perform public.wl_enqueue_dates_changed(p_booking_id);
  return jsonb_build_object('booking_id', p_booking_id, 'old_check_out_at', v_check_out, 'new_check_out_at', v_covered,
    'requested_check_out_at', p_new_check_out_at, 'added_days', v_added, 'partner_credit_cents', v_credit,
    'overage_daily_cents', v_daily, 'overage_cents', v_overage, 'kind', v_kind);
end $$;
revoke all on function public.extend_booking_flight_delay(uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.extend_booking_flight_delay(uuid, timestamptz, text, text, text, text) to service_role;

-- Saída real registrada pelo Operator no check-out (escopo bookings:checkin), hub_admin ou service_role.
create or replace function public.operator_record_flight_checkout(
  p_booking_id uuid, p_actual_check_out_at timestamptz, p_overage_charged_cents integer default 0, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_company uuid; v_ext public.booking_fare_extension%rowtype; v_overage int; v_status public.booking_status; v_charged int;
begin
  select l.company_id, b.status into v_company, v_status
    from public.booking b join public.location l on l.id = b.location_id
   where b.id = p_booking_id and b.deleted_at is null;
  if v_company is null then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_hub_admin() or public.member_has_scope(v_company, 'bookings:checkin')) then
    raise exception 'Sem permissão para registrar o check-out.' using errcode = '42501';
  end if;
  select * into v_ext from public.booking_fare_extension where booking_id = p_booking_id order by created_at desc limit 1;
  if v_ext.id is null then raise exception 'Esta reserva não tem proteção de voo acionada.' using errcode = 'P0001'; end if;
  if v_ext.overage_recorded_at is not null then raise exception 'A saída real desta reserva já foi registrada.' using errcode = 'P0001'; end if;
  if v_status not in ('checked_in', 'confirmed') then raise exception 'Só reservas em uso podem ter a saída registrada.' using errcode = 'P0001'; end if;
  if p_actual_check_out_at > now() + interval '10 minutes' then raise exception 'A saída real não pode estar no futuro.' using errcode = 'P0001'; end if;
  v_overage := public.flight_overage_days(v_ext.new_check_out_at, p_actual_check_out_at) * v_ext.overage_daily_cents;
  v_charged := greatest(0, coalesce(p_overage_charged_cents, 0));
  update public.booking_fare_extension
     set actual_check_out_at = p_actual_check_out_at, overage_cents = v_overage, overage_charged_cents = v_charged,
         overage_note = nullif(trim(coalesce(p_note, '')), ''), overage_recorded_by = auth.uid(), overage_recorded_at = now()
   where id = v_ext.id;
  update public.booking set status = 'completed', checked_out_at = p_actual_check_out_at where id = p_booking_id;
  return jsonb_build_object('overage_cents', v_overage, 'overage_charged_cents', v_charged, 'actual_check_out_at', p_actual_check_out_at);
end $$;
revoke all on function public.operator_record_flight_checkout(uuid, timestamptz, integer, text) from public, anon;
grant execute on function public.operator_record_flight_checkout(uuid, timestamptz, integer, text) to authenticated, service_role;

-- Relatório mensal (hub_admin lê tudo pela RLS da extensão; o parceiro veria só o dele).
create or replace view public.flight_protection_monthly with (security_invoker = true) as
  select date_trunc('month', e.created_at)::date as month, l.company_id,
         count(*)::int as claims,
         count(*) filter (where e.kind = 'delay')::int as delay,
         count(*) filter (where e.kind = 'cancellation')::int as cancellation,
         coalesce(sum(e.partner_credit_cents), 0)::bigint as partner_credit_cents,
         coalesce(sum(e.overage_cents), 0)::bigint as overage_cents,
         coalesce(sum(e.overage_charged_cents), 0)::bigint as overage_charged_cents
    from public.booking_fare_extension e
    join public.booking b on b.id = e.booking_id
    join public.location l on l.id = b.location_id
   group by 1, 2;
grant select on public.flight_protection_monthly to authenticated;
