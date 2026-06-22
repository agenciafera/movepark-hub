-- E2.6.1 · Integração WPS / sistemas de pátio — webhook inbound + outbound.
--
-- Inbound (pátio → Hub): evento de veículo entrou/saiu (placa/ANPR) → check-in/check-out real da reserva.
-- Outbound (Hub → pátio): reserva confirmada/cancelada → enfileira entrega assinada (HMAC) com retry.
-- Entregue como rota do Public API (escopo wps:write); idempotente; mapeia placa/lote por external_ref.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mapeamento: código do lote no WPS + placa normalizada
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.location add column if not exists external_ref text;
comment on column public.location.external_ref is
  'Código deste lote no sistema de pátio (WPS) do parceiro — usado pra casar eventos de placa.';
create unique index if not exists location_external_ref_uidx
  on public.location (company_id, external_ref) where external_ref is not null and deleted_at is null;

alter table public.vehicle
  add column if not exists plate_normalized text
  generated always as (upper(regexp_replace(license_plate, '[^A-Za-z0-9]', '', 'g'))) stored;
create index if not exists vehicle_plate_normalized_idx on public.vehicle (plate_normalized);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Inbound: log idempotente + RPC de evento
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wps_event (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.company(id) on delete cascade,
  external_event_id  text not null,
  type               text not null,
  plate              text,
  location_id        uuid references public.location(id) on delete set null,
  booking_id         uuid references public.booking(id) on delete set null,
  status             text,
  message            text,
  raw                jsonb,
  received_at        timestamptz not null default now(),
  unique (company_id, external_event_id)
);
create index if not exists wps_event_company_idx on public.wps_event (company_id, received_at desc);
alter table public.wps_event enable row level security;
create policy wps_event_admin on public.wps_event for all to authenticated
  using (public.is_hub_admin()) with check (public.is_hub_admin());
create policy wps_event_operator_select on public.wps_event for select to authenticated
  using (company_id in (select public.current_company_ids()));

create or replace function public.api_wps_event(
  p_company_id uuid,
  p_external_event_id text,
  p_type text,
  p_location_ref text default null,
  p_plate text default null,
  p_booking_code text default null,
  p_occurred_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_location_id uuid;
  v_booking     record;
  v_plate_norm  text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  v_new_status  public.booking_status;
  v_msg         text;
  v_matched     boolean := false;
  v_prev        record;
begin
  if p_type not in ('vehicle.entered', 'vehicle.exited') then
    raise exception 'Tipo de evento inválido: %', p_type using errcode = '22023';
  end if;
  if p_external_event_id is null or p_external_event_id = '' then
    raise exception 'event_id é obrigatório.' using errcode = '22023';
  end if;
  if p_booking_code is null and v_plate_norm = '' then
    raise exception 'Informe booking_code ou plate.' using errcode = '22023';
  end if;

  -- idempotência: evento já processado → devolve o resultado anterior
  select * into v_prev from public.wps_event
   where company_id = p_company_id and external_event_id = p_external_event_id;
  if found then
    return jsonb_build_object('matched', v_prev.booking_id is not null, 'booking_code', null,
      'status', v_prev.status, 'duplicate', true, 'message', v_prev.message);
  end if;

  -- resolve o lote (opcional)
  if p_location_ref is not null then
    select l.id into v_location_id from public.location l
     where l.company_id = p_company_id and l.external_ref = p_location_ref and l.deleted_at is null
     limit 1;
  end if;

  -- resolve a reserva: por código (preferencial) ou por placa normalizada + lote + janela + status
  if p_booking_code is not null then
    select b.id, b.code, b.status into v_booking
      from public.booking b join public.location l on l.id = b.location_id
     where b.code = p_booking_code and l.company_id = p_company_id and b.deleted_at is null
     limit 1;
  else
    select b.id, b.code, b.status into v_booking
      from public.booking b
      join public.vehicle v on v.id = b.vehicle_id
      join public.location l on l.id = b.location_id
     where l.company_id = p_company_id
       and b.deleted_at is null
       and v.plate_normalized = v_plate_norm
       and (v_location_id is null or b.location_id = v_location_id)
       and (
         (p_type = 'vehicle.entered' and b.status = 'confirmed') or
         (p_type = 'vehicle.exited'  and b.status = 'checked_in')
       )
       and p_occurred_at >= b.check_in_at - interval '12 hours'
       and p_occurred_at <= b.check_out_at + interval '12 hours'
     order by b.check_in_at desc
     limit 1;
  end if;

  if v_booking.id is null then
    v_msg := 'Reserva não encontrada para o evento.';
  elsif p_type = 'vehicle.entered' then
    if v_booking.status <> 'confirmed' then
      v_msg := format('Status %s não permite check-in.', v_booking.status);
    else
      update public.booking set status = 'checked_in', checked_in_at = now() where id = v_booking.id;
      v_matched := true; v_new_status := 'checked_in'; v_msg := 'check-in registrado';
    end if;
  else -- vehicle.exited
    if v_booking.status <> 'checked_in' then
      v_msg := format('Status %s não permite check-out.', v_booking.status);
    else
      update public.booking set status = 'completed', checked_out_at = now() where id = v_booking.id;
      v_matched := true; v_new_status := 'completed'; v_msg := 'check-out registrado';
    end if;
  end if;

  -- registra o evento (idempotência por unique; corrida → trata como duplicado)
  begin
    insert into public.wps_event
      (company_id, external_event_id, type, plate, location_id, booking_id, status, message, raw)
    values
      (p_company_id, p_external_event_id, p_type, p_plate, v_location_id, v_booking.id,
       coalesce(v_new_status::text, v_booking.status::text), v_msg,
       jsonb_build_object('type', p_type, 'plate', p_plate, 'booking_code', p_booking_code,
                          'location_ref', p_location_ref, 'occurred_at', p_occurred_at));
  exception when unique_violation then
    return jsonb_build_object('matched', false, 'booking_code', null, 'status', null,
      'duplicate', true, 'message', 'evento concorrente já registrado');
  end;

  return jsonb_build_object(
    'matched', v_matched,
    'booking_code', v_booking.code,
    'status', coalesce(v_new_status::text, v_booking.status::text),
    'duplicate', false,
    'message', v_msg
  );
end; $fn$;

revoke all on function public.api_wps_event(uuid, text, text, text, text, text, timestamptz) from public;
grant execute on function public.api_wps_event(uuid, text, text, text, text, text, timestamptz)
  to authenticated, service_role;

-- escopo da Public API
insert into public.api_scope (scope, module, description) values
  ('wps:write', 'wps', 'Eventos de pátio (WPS): check-in/out por placa, entrada/saída de veículo')
on conflict (scope) do update set module = excluded.module, description = excluded.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Outbound: config por empresa + outbox + trigger de enfileiramento
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.company
  add column if not exists wps_webhook_url text,
  add column if not exists wps_webhook_secret text,
  add column if not exists wps_webhook_enabled boolean not null default false;

alter table public.company drop constraint if exists company_wps_requires_config;
alter table public.company add constraint company_wps_requires_config
  check (wps_webhook_enabled = false or (wps_webhook_url is not null and wps_webhook_secret is not null));

create table if not exists public.wps_delivery (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.company(id) on delete cascade,
  event_id        text not null unique,
  type            text not null,
  payload         jsonb not null,
  target_url      text not null,
  status          text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 6,
  next_attempt_at timestamptz not null default now(),
  last_status     integer,
  last_error      text,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists wps_delivery_pending_idx
  on public.wps_delivery (next_attempt_at) where status in ('pending', 'failed');
create index if not exists wps_delivery_company_idx on public.wps_delivery (company_id, created_at desc);
create trigger wps_delivery_set_updated_at
  before update on public.wps_delivery for each row execute function public.set_updated_at();
alter table public.wps_delivery enable row level security;
create policy wps_delivery_admin on public.wps_delivery for all to authenticated
  using (public.is_hub_admin()) with check (public.is_hub_admin());
create policy wps_delivery_operator_select on public.wps_delivery for select to authenticated
  using (company_id in (select public.current_company_ids()));

create or replace function public.wps_enqueue_booking_event()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_type    text;
  v_company record;
  v_plate   text;
  v_loc_ref text;
begin
  if (tg_op = 'INSERT' and new.status = 'confirmed')
     or (tg_op = 'UPDATE' and new.status = 'confirmed' and old.status is distinct from 'confirmed') then
    v_type := 'booking.confirmed';
  elsif (tg_op = 'INSERT' and new.status = 'cancelled')
     or (tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled') then
    v_type := 'booking.cancelled';
  else
    return new;
  end if;

  select c.id, c.wps_webhook_url, c.wps_webhook_enabled into v_company
    from public.company c join public.location l on l.company_id = c.id
   where l.id = new.location_id;
  if not coalesce(v_company.wps_webhook_enabled, false) or v_company.wps_webhook_url is null then
    return new;
  end if;

  select v.license_plate into v_plate from public.vehicle v where v.id = new.vehicle_id;
  select l.external_ref into v_loc_ref from public.location l where l.id = new.location_id;

  insert into public.wps_delivery (company_id, event_id, type, payload, target_url)
  values (
    v_company.id,
    gen_random_uuid()::text,
    v_type,
    jsonb_build_object(
      'version', '1', 'type', v_type, 'occurred_at', now(),
      'data', jsonb_build_object(
        'booking_code', new.code, 'status', new.status, 'plate', v_plate,
        'location_ref', v_loc_ref, 'check_in_at', new.check_in_at, 'check_out_at', new.check_out_at
      )
    ),
    v_company.wps_webhook_url
  );
  return new;
end; $fn$;

drop trigger if exists booking_wps_enqueue on public.booking;
create trigger booking_wps_enqueue
  after insert or update of status on public.booking
  for each row execute function public.wps_enqueue_booking_event();
