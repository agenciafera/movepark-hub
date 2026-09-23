-- Proteção contra atraso de voo com limite, prova e lançamento (23/09/2026).
-- Spec: docs/specs/tarifas-operacao.md (itens 2.5 a 2.7; Q-025, Q-026, Q-027 aceitas em 23/09).
--
-- A RPC existia sem tela, sem limite (qualquer saída futura, quantas vezes quisesse), sem número
-- do voo e sem pagar o parceiro pelo dia extra que a Movepark vendeu. Agora:
--   - até `flight_extension_max_hours` (24) depois da saída, UMA vez por reserva;
--   - acionável até `flight_extension_after_checkout_minutes` (120) depois da saída;
--   - número do voo obrigatório ao acionar (opcional no checkout da Superflex: `booking.flight_number`);
--   - a diária extra é da Movepark: crédito ao parceiro em `payout_debt_settlement`
--     (kind `flight_extension_credit`, valor positivo = reduz o que ele deve; sem dívida, fica a
--     favor dele), calculado pelo motor (preço de N+1 diárias menos N, na parte do parceiro).

insert into public.app_setting (key, value) values
  ('flight_extension_max_hours', '24'),
  ('flight_extension_after_checkout_minutes', '120')
on conflict (key) do nothing;

alter table public.booking
  add column if not exists flight_number text
  check (flight_number is null or length(flight_number) between 2 and 16);
comment on column public.booking.flight_number is
  'Número do voo informado no checkout da Superflex (opcional) ou ao acionar a proteção contra atraso.';

alter table public.booking_fare_extension
  add column if not exists flight_number text,
  add column if not exists partner_credit_cents integer,
  add column if not exists settlement_id uuid references public.payout_debt_settlement(id);

do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.payout_debt_settlement'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.payout_debt_settlement drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.payout_debt_settlement
  add constraint payout_debt_settlement_kind_check
  check (kind in ('manual_payment', 'adjustment', 'flight_extension_credit'));

-- O dono pode gravar o número do voo enquanto a reserva está pendente (checkout).
CREATE OR REPLACE FUNCTION public.booking_guard_write_allowlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_changed text[];
  v_allowed text[] := array['updated_at'];
  v_denied  text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Diff genérico: toda coluna cujo valor mudou, inclusive as que ainda não existem hoje.
  select coalesce(array_agg(n.key order by n.key), '{}')
    into v_changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key);

  if v_changed <@ v_allowed then
    return new;
  end if;

  if public.is_hub_admin() or exists (
       select 1 from public.location l
       where l.id = old.location_id
         and l.company_id in (select public.current_company_ids())
         and (public.member_has_scope(l.company_id, 'bookings:write')
              or public.member_has_scope(l.company_id, 'bookings:checkin'))
     ) then
    v_allowed := v_allowed || array['status', 'checked_in_at', 'checked_out_at', 'notes'];
  end if;

  if old.profile_id = (select auth.uid()) and old.status = 'pending' then
    v_allowed := v_allowed || array[
      'vehicle_id', 'passenger_count', 'has_pcd',
      'customer_first_name', 'customer_last_name', 'customer_name',
      'customer_phone', 'customer_email', 'customer_tax_id', 'flight_number',
      'passenger_first_name', 'passenger_last_name', 'passenger_phone',
      'status', 'deleted_at'
    ];
  end if;

  select array_agg(c order by c) into v_denied
  from unnest(v_changed) c
  where c <> all (v_allowed);

  if v_denied is not null then
    raise exception 'Estes campos da reserva não são editáveis por aqui: %.', array_to_string(v_denied, ', ')
      using errcode = '42501';
  end if;
  return new;
end $function$

;

drop function if exists public.extend_booking_flight_delay(uuid, timestamptz, text, text);
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

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'old_check_out_at', v_check_out,
    'new_check_out_at', p_new_check_out_at,
    'added_days', v_added,
    'partner_credit_cents', v_credit);
end $$;
revoke all on function public.extend_booking_flight_delay(uuid, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.extend_booking_flight_delay(uuid, timestamptz, text, text, text) to service_role;
