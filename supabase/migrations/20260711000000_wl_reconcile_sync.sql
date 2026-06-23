-- E2.5.2 · Sync WL↔Hub confiável + reconciliação (anti-overbooking real).
--
-- 1) external_booked_count: espelho do que o WL vendeu (sold_wl), atualizado pelo job de reconciliação.
--    O anti-overbooking do Hub passa a considerar: capacity − booked_count − external_booked_count.
-- 2) Outbox wl_delivery + triggers (reserve na criação, release no cancelamento) — push Hub→WL confiável.
-- 3) Log de divergência da reconciliação.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Coluna espelho
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.location_parking_availability
  add column if not exists external_booked_count integer not null default 0
  check (external_booked_count >= 0);

comment on column public.location_parking_availability.external_booked_count is
  'Vagas vendidas no white-label (sold_wl), espelhadas pelo job wl-reconcile. Entram no anti-overbooking.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Anti-overbooking: _create_booking_core considera external_booked_count
--    (recriação fiel da def de 20260704 + leitura/gate do external)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._create_booking_core(
  p_profile_id uuid,
  p_created_via_api_key_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_passenger_count integer,
  p_has_pcd boolean,
  p_vehicle_id uuid,
  p_add_on_ids uuid[],
  p_coupon_code text,
  p_origin text
) returns jsonb language plpgsql security definer set search_path to 'public' as $core$
declare
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
begin
  select lpt.id, lpt.capacity, lpt.is_active,
         l.id, l.slug, c.slug, pt.id, pt.code, cpt.id,
         lpt.has_minimum_stay, lpt.minimum_stay_value, lpt.minimum_stay_unit,
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes
    into v_lpt_id, v_lpt_capacity, v_lpt_active,
         v_location_id, v_location_slug, v_company_slug, v_parking_type_id, v_parking_type_code, v_cpt_id,
         v_has_min_stay, v_min_stay_value, v_min_stay_unit,
         v_has_min_date, v_min_date, v_advance_min
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where lpt.id = p_location_parking_type_id and l.deleted_at is null;

  if v_lpt_id is null then raise exception 'Tipo de vaga não encontrado' using errcode = 'P0001'; end if;
  if not v_lpt_active then raise exception 'Tipo de vaga desativado' using errcode = 'P0001'; end if;
  if p_check_out_at <= p_check_in_at then
    raise exception 'Check-out precisa ser após o check-in' using errcode = 'P0001';
  end if;

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_total_minutes::numeric / (60 * 24))::int);

  if v_has_min_stay and not public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days) then
    raise exception 'Estadia mínima não atingida para essa vaga.' using errcode = 'P0001';
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
  v_expires_at := now() + interval '30 minutes';
  v_total := v_subtotal - v_discount;

  insert into public.booking (
    code, profile_id, location_id, vehicle_id, check_in_at, check_out_at,
    total_amount, currency, passenger_count, has_pcd, origin, status, expires_at,
    created_via_api_key_id, customer_name, customer_email, customer_phone
  ) values (
    v_code, p_profile_id, v_location_id, p_vehicle_id, p_check_in_at, p_check_out_at,
    v_total, 'BRL', p_passenger_count, p_has_pcd, p_origin, 'pending', v_expires_at,
    p_created_via_api_key_id, p_customer_name, p_customer_email, p_customer_phone
  ) returning id into v_booking_id;

  insert into public.booking_item (booking_id, item_type, parking_type_id, quantity, unit_price, subtotal)
  values (v_booking_id, 'parking', v_parking_type_id, 1, v_subtotal, v_subtotal);

  v_line_items := v_line_items || jsonb_build_object(
    'kind', 'parking', 'name', v_parking_type_code, 'quantity', 1,
    'unit_price', v_subtotal, 'subtotal', v_subtotal);

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
    'total', v_total,
    'line_items', v_line_items);
  update public.booking set price_breakdown = v_breakdown where id = v_booking_id;

  return jsonb_build_object(
    'code', v_code, 'booking_id', v_booking_id, 'total_amount', v_total,
    'subtotal', v_subtotal, 'base_price', v_base,
    'discount', v_discount, 'auto_discount', v_auto_discount,
    'old_price', v_old_price, 'days', v_days, 'expires_at', v_expires_at,
    'line_items', v_line_items, 'price_breakdown', v_breakdown);
end; $core$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Leitura: check_availability + availability_batch consideram external_booked_count
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.check_availability(
  p_company text,
  p_location text,
  p_parking_type text,
  p_check_in_at timestamp with time zone,
  p_check_out_at timestamp with time zone
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $fca$
declare
  v_lpt_id uuid; v_capacity int; v_active boolean;
  v_near_threshold int; v_near_message text;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_total_minutes numeric; v_days int; v_max_booked int; v_remaining int;
  v_min_stay_ok boolean; v_min_date_ok boolean; v_advance_ok boolean;
  v_sold_out boolean; v_near boolean; v_ok boolean;
  v_reasons text[] := '{}';
begin
  if p_check_in_at is null or p_check_out_at is null or p_check_out_at <= p_check_in_at then
    return jsonb_build_object('error', 'Período inválido');
  end if;

  select lpt.id, lpt.capacity, lpt.is_active,
         lpt.near_capacity_threshold, lpt.near_capacity_message,
         lpt.has_minimum_stay, lpt.minimum_stay_value, lpt.minimum_stay_unit,
         lpt.has_minimum_date, lpt.minimum_date, pr.advance_booking_minutes
    into v_lpt_id, v_capacity, v_active,
         v_near_threshold, v_near_message,
         v_has_min_stay, v_min_stay_value, v_min_stay_unit,
         v_has_min_date, v_min_date, v_advance_min
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where c.slug = p_company and l.slug = p_location and pt.code = p_parking_type
    and l.deleted_at is null
  limit 1;

  if v_lpt_id is null then
    return jsonb_build_object('error',
      format('Tipo de vaga não encontrado: %s / %s / %s', p_company, p_location, p_parking_type));
  end if;

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_total_minutes / (60 * 24))::int);

  -- data mais cheia do período manda (hub + white-label)
  select coalesce(max(a.booked_count + coalesce(a.external_booked_count, 0)), 0) into v_max_booked
  from generate_series(p_check_in_at::date, (p_check_out_at - interval '1 microsecond')::date, '1 day') d(date)
  left join public.location_parking_availability a
    on a.location_parking_type_id = v_lpt_id and a.date = d.date::date;

  v_remaining := v_capacity - v_max_booked;
  v_sold_out  := (not v_active) or v_remaining <= 0;
  v_near      := v_near_threshold is not null and v_remaining > 0 and v_remaining <= v_near_threshold;

  v_min_stay_ok := (not v_has_min_stay)
    or public.min_stay_satisfied(v_min_stay_unit, v_min_stay_value, v_total_minutes, v_days);
  v_min_date_ok := (not v_has_min_date) or v_min_date is null or p_check_in_at::date >= v_min_date;
  v_advance_ok  := v_advance_min is null
    or p_check_in_at >= now() + (v_advance_min || ' minutes')::interval;

  if v_sold_out      then v_reasons := array_append(v_reasons, 'sold_out'); end if;
  if not v_min_stay_ok then v_reasons := array_append(v_reasons, 'min_stay'); end if;
  if not v_min_date_ok then v_reasons := array_append(v_reasons, 'min_date'); end if;
  if not v_advance_ok  then v_reasons := array_append(v_reasons, 'advance'); end if;

  v_ok := not v_sold_out and v_min_stay_ok and v_min_date_ok and v_advance_ok;

  return jsonb_build_object(
    'ok',                  v_ok,
    'capacity',            v_capacity,
    'remaining',           greatest(0, v_remaining),
    'sold_out',            v_sold_out,
    'near_capacity',       v_near,
    'near_capacity_message', v_near_message,
    'min_stay_ok',         v_min_stay_ok,
    'min_stay_value',      v_min_stay_value,
    'min_stay_unit',       v_min_stay_unit,
    'min_date_ok',         v_min_date_ok,
    'minimum_date',        v_min_date,
    'advance_ok',          v_advance_ok,
    'advance_minutes',     v_advance_min,
    'days',                v_days,
    'reasons',             to_jsonb(v_reasons));
end; $fca$;

create or replace function public.availability_batch(
  p_lpt_ids uuid[],
  p_check_in_at timestamp with time zone,
  p_check_out_at timestamp with time zone
) returns table(
  location_parking_type_id uuid,
  capacity integer,
  remaining integer,
  sold_out boolean,
  near_capacity boolean,
  near_capacity_message text
) language sql stable security definer set search_path to 'public' as $fab$
  with dates as (
    select generate_series(p_check_in_at::date, (p_check_out_at - interval '1 microsecond')::date, '1 day')::date as date
  ),
  maxbooked as (
    select lpt.id as lpt_id, lpt.capacity, lpt.is_active,
           lpt.near_capacity_threshold, lpt.near_capacity_message,
           coalesce(max(a.booked_count + coalesce(a.external_booked_count, 0)), 0) as max_booked
    from public.location_parking_type lpt
    cross join dates d
    left join public.location_parking_availability a
      on a.location_parking_type_id = lpt.id and a.date = d.date
    where lpt.id = any(p_lpt_ids)
    group by lpt.id, lpt.capacity, lpt.is_active, lpt.near_capacity_threshold, lpt.near_capacity_message
  )
  select
    lpt_id,
    capacity,
    greatest(0, capacity - max_booked) as remaining,
    (not is_active) or (capacity - max_booked) <= 0 as sold_out,
    (near_capacity_threshold is not null
      and (capacity - max_booked) > 0
      and (capacity - max_booked) <= near_capacity_threshold) as near_capacity,
    near_capacity_message
  from maxbooked;
$fab$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Outbox Hub→WL (push confiável) + triggers
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wl_delivery (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.company(id) on delete cascade,
  event_id        text not null unique,
  operation       text not null check (operation in ('reserve', 'release')),
  payload         jsonb not null,
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
create index if not exists wl_delivery_pending_idx
  on public.wl_delivery (next_attempt_at) where status in ('pending', 'failed');
create index if not exists wl_delivery_company_idx on public.wl_delivery (company_id, created_at desc);
create trigger wl_delivery_set_updated_at
  before update on public.wl_delivery for each row execute function public.set_updated_at();
alter table public.wl_delivery enable row level security;
create policy wl_delivery_admin on public.wl_delivery for all to authenticated
  using (public.is_hub_admin()) with check (public.is_hub_admin());
create policy wl_delivery_operator_select on public.wl_delivery for select to authenticated
  using (company_id in (select public.current_company_ids()));

-- Enfileira reserve (na criação do item de vaga) / release (no cancelamento da reserva).
create or replace function public.wl_enqueue_delivery()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_op text := tg_argv[0];
  v_booking_id uuid;
  v_pt uuid;
  v_rec record;
begin
  if tg_table_name = 'booking_item' then
    v_booking_id := new.booking_id;
    v_pt := new.parking_type_id;
  else
    v_booking_id := new.id;
    select parking_type_id into v_pt from public.booking_item
     where booking_id = v_booking_id and item_type = 'parking' limit 1;
  end if;
  if v_pt is null then return new; end if;

  select c.id as company_id, c.wl_sync_enabled,
         lpt.wl_category_slug, lpt.wl_product_slug,
         b.check_in_at, b.check_out_at
    into v_rec
  from public.booking b
  join public.location l on l.id = b.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.parking_type_id = v_pt and cpt.company_id = c.id
  join public.location_parking_type lpt on lpt.location_id = l.id and lpt.company_parking_type_id = cpt.id
  where b.id = v_booking_id
  limit 1;

  if not coalesce(v_rec.wl_sync_enabled, false)
     or v_rec.wl_category_slug is null or v_rec.wl_product_slug is null then
    return new;
  end if;

  insert into public.wl_delivery (company_id, event_id, operation, payload)
  values (
    v_rec.company_id,
    v_booking_id::text || ':' || v_op,
    v_op,
    jsonb_build_object(
      'external_id', v_booking_id::text,
      'operation', v_op,
      'category_slug', v_rec.wl_category_slug,
      'product_slug', v_rec.wl_product_slug,
      'quantity', 1,
      'start_date', to_char(v_rec.check_in_at, 'YYYY-MM-DD'),
      'end_date', to_char(v_rec.check_out_at, 'YYYY-MM-DD')
    )
  )
  on conflict (event_id) do nothing;
  return new;
end; $fn$;

drop trigger if exists booking_item_wl_reserve on public.booking_item;
create trigger booking_item_wl_reserve
  after insert on public.booking_item
  for each row when (new.item_type = 'parking')
  execute function public.wl_enqueue_delivery('reserve');

drop trigger if exists booking_wl_release on public.booking;
create trigger booking_wl_release
  after update of status on public.booking
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.wl_enqueue_delivery('release');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Log de reconciliação (auditoria de divergência)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wl_reconcile_log (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid references public.company(id) on delete cascade,
  location_parking_type_id uuid references public.location_parking_type(id) on delete cascade,
  date                     date not null,
  old_external             integer,
  new_external             integer,
  created_at               timestamptz not null default now()
);
create index if not exists wl_reconcile_log_idx on public.wl_reconcile_log (created_at desc);

-- Aplica o resultado do pull (sold_wl por dia) em external_booked_count, preservando booked_count,
-- e registra divergências no log. p_rows = [{ "date": "YYYY-MM-DD", "external": <int> }, ...].
create or replace function public.wl_reconcile_apply(p_lpt_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_company_id uuid; v_row jsonb; v_date date; v_new int; v_old int; v_changed int := 0;
begin
  select l.company_id into v_company_id
  from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
  where lpt.id = p_lpt_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_date := (v_row->>'date')::date;
    v_new := greatest(0, coalesce((v_row->>'external')::int, 0));
    select external_booked_count into v_old from public.location_parking_availability
     where location_parking_type_id = p_lpt_id and date = v_date;
    if v_old is null and v_new = 0 then continue; end if;  -- nada a espelhar
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count, external_booked_count)
    values (p_lpt_id, v_date, 0, v_new)
    on conflict (location_parking_type_id, date) do update set external_booked_count = v_new;
    if coalesce(v_old, 0) is distinct from v_new then
      insert into public.wl_reconcile_log (company_id, location_parking_type_id, date, old_external, new_external)
      values (v_company_id, p_lpt_id, v_date, v_old, v_new);
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
end; $fn$;

revoke all on function public.wl_reconcile_apply(uuid, jsonb) from public;
grant execute on function public.wl_reconcile_apply(uuid, jsonb) to service_role;

alter table public.wl_reconcile_log enable row level security;
create policy wl_reconcile_log_admin on public.wl_reconcile_log for all to authenticated
  using (public.is_hub_admin()) with check (public.is_hub_admin());
create policy wl_reconcile_log_operator_select on public.wl_reconcile_log for select to authenticated
  using (company_id in (select public.current_company_ids()));
