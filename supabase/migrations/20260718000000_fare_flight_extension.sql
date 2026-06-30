-- E2.8-e (passo 2) · Auto-extensão por atraso de voo (benefício Superflex).
--
-- Estende `booking.check_out_at` cobrindo diária(s) extra(s) SEM cobrança (benefício da Superflex,
-- `fare_benefits.flight_delay_protection`), re-segurando a capacidade das datas adicionadas (mesma
-- regra do hold de criação: respeita `blocked` e capacidade considerando booked + external). É a
-- "encanação" da proteção contra atraso de voo — o disparo automático por uma API de voos é futuro;
-- por ora a extensão é acionada pela Edge `extend-booking` (dono ou staff).

-- Log de extensões (auditoria do benefício).
create table public.booking_fare_extension (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.booking(id) on delete cascade,
  old_check_out_at  timestamptz not null,
  new_check_out_at  timestamptz not null,
  added_days        integer not null default 0,
  actor             text not null default 'system',
  reason            text,
  created_at        timestamptz not null default now()
);
create index booking_fare_extension_booking_idx on public.booking_fare_extension (booking_id, created_at desc);

alter table public.booking_fare_extension enable row level security;
-- Dono lê as extensões da própria reserva; hub_admin vê tudo. Escrita só service_role (via RPC/Edge).
create policy booking_fare_extension_select on public.booking_fare_extension for select to authenticated
  using (
    public.is_hub_admin()
    or exists (select 1 from public.booking b where b.id = booking_id and b.profile_id = auth.uid())
  );

-- RPC: estende a reserva sem cobrança, gateada à Superflex, re-segurando capacidade. Idempotente
-- por construção: exige nova saída estritamente depois da atual.
create or replace function public.extend_booking_flight_delay(
  p_booking_id uuid,
  p_new_check_out_at timestamptz,
  p_actor text default 'system',
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_status public.booking_status; v_check_in timestamptz; v_check_out timestamptz;
  v_location_id uuid; v_benefits jsonb; v_pt uuid;
  v_lpt_id uuid; v_cap int; v_date date; v_booked int; v_blocked boolean; v_external int;
  v_added int := 0;
begin
  select status, check_in_at, check_out_at, location_id, fare_benefits
    into v_status, v_check_in, v_check_out, v_location_id, v_benefits
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
  if p_new_check_out_at <= v_check_out then
    raise exception 'A nova saída precisa ser depois da saída atual.' using errcode = 'P0001';
  end if;

  -- Resolve o tipo de vaga da unidade (booking não guarda o lpt; vem do item de vaga + location).
  select bi.parking_type_id into v_pt
  from public.booking_item bi
  where bi.booking_id = p_booking_id and bi.item_type = 'parking'
  limit 1;

  select lpt.id, lpt.capacity into v_lpt_id, v_cap
  from public.location_parking_type lpt
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  where lpt.location_id = v_location_id and cpt.parking_type_id = v_pt
  limit 1;

  if v_lpt_id is null then
    raise exception 'Tipo de vaga da reserva não localizado.' using errcode = 'P0001';
  end if;

  -- Re-segura apenas as datas ADICIONADAS (após o último dia já reservado).
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

  -- Estende a reserva (sem cobrança — coberto pela Superflex).
  update public.booking set check_out_at = p_new_check_out_at where id = p_booking_id;

  insert into public.booking_fare_extension (booking_id, old_check_out_at, new_check_out_at, added_days, actor, reason)
  values (p_booking_id, v_check_out, p_new_check_out_at, v_added, coalesce(p_actor, 'system'), p_reason);

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'old_check_out_at', v_check_out,
    'new_check_out_at', p_new_check_out_at,
    'added_days', v_added);
end; $fn$;

revoke all on function public.extend_booking_flight_delay(uuid, timestamptz, text, text) from public;
grant execute on function public.extend_booking_flight_delay(uuid, timestamptz, text, text) to service_role;
