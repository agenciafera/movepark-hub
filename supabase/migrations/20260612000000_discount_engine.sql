-- Motor de descontos automáticos (Fase 1 + Fase 2). Ver docs/specs/discount-rules.md.
-- Regra da empresa aplicada DIRETO no preço (sem código): reduz o total e produz o
-- old_price riscado real. Avaliada dentro do simulate_price (preview) e re-avaliada de
-- forma autoritativa em create_booking_atomic (com check_in p/ advance_days). Empilha
-- com cupom. Gestão pelo operator via RPCs SECURITY DEFINER (escrita sem RLS direta).
-- Dollar-quotes nomeados; % escapado como %% em RAISE.

-- 1) Tabelas --------------------------------------------------------------------
create table if not exists public.discount_rule (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.company(id) on delete cascade,
  location_id    uuid references public.location(id) on delete cascade,  -- null = todas
  name           text not null,
  description    text,
  discount_type  public.discount_type not null,
  discount_value numeric(12,2) not null check (discount_value >= 0),
  valid_from     timestamptz,
  valid_until    timestamptz,
  min_days       integer check (min_days is null or min_days >= 1),
  min_amount     numeric(12,2) check (min_amount is null or min_amount >= 0),
  advance_days   integer check (advance_days is null or advance_days >= 0),
  allow_coupon_stack boolean not null default true,
  priority       integer not null default 0,
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists discount_rule_company_loc_idx
  on public.discount_rule (company_id, location_id) where is_active;

drop trigger if exists discount_rule_set_updated_at on public.discount_rule;
create trigger discount_rule_set_updated_at before update on public.discount_rule
  for each row execute function public.set_updated_at();

create table if not exists public.discount_rule_parking_type (
  discount_rule_id        uuid not null references public.discount_rule(id) on delete cascade,
  company_parking_type_id uuid not null references public.company_parking_type(id) on delete cascade,
  primary key (discount_rule_id, company_parking_type_id)
);

create table if not exists public.booking_discount (
  booking_id       uuid not null references public.booking(id) on delete cascade,
  discount_rule_id uuid not null references public.discount_rule(id) on delete restrict,
  discount_applied numeric(12,2) not null check (discount_applied >= 0),
  created_at       timestamptz not null default now(),
  primary key (booking_id, discount_rule_id)
);

-- RLS
alter table public.discount_rule enable row level security;
alter table public.discount_rule_parking_type enable row level security;
alter table public.booking_discount enable row level security;

do $$ begin
  create policy catalog_read_discount_rule on public.discount_rule
    for select using (is_active);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy discount_rule_operator_select on public.discount_rule
    for select using (
      public.is_hub_admin() or company_id in (select public.current_company_ids())
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy discount_rule_parking_type_operator_select on public.discount_rule_parking_type
    for select using (
      public.is_hub_admin() or exists (
        select 1 from public.discount_rule dr
        where dr.id = discount_rule_parking_type.discount_rule_id
          and dr.company_id in (select public.current_company_ids())
      )
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy booking_discount_select on public.booking_discount
    for select using (
      public.is_hub_admin() or exists (
        select 1 from public.booking b
        where b.id = booking_discount.booking_id
          and (b.profile_id = auth.uid()
               or b.location_id in (
                 select l.id from public.location l
                 where l.company_id in (select public.current_company_ids())))
      )
    );
exception when duplicate_object then null; end $$;

-- 2) Guard de escopo ------------------------------------------------------------
create or replace function public.discount_assert_company_access(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fa$
begin
  if public.is_hub_admin() then return; end if;
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para gerenciar descontos desta empresa.'
      using errcode = '42501';
  end if;
end; $fa$;

-- 3) Avaliação (best-pick) ------------------------------------------------------
create or replace function public.discount_evaluate(
  p_location_id uuid,
  p_company_parking_type_id uuid,
  p_base_price numeric,
  p_days integer,
  p_check_in_at timestamptz
) returns table(discount_rule_id uuid, discount numeric, label text, allow_coupon_stack boolean)
language plpgsql security definer set search_path to 'public' as $fe$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.location where id = p_location_id;
  if v_company_id is null then return; end if;

  return query
  with eligible as (
    select dr.id, dr.discount_type, dr.discount_value, dr.priority, dr.sort_order,
           dr.allow_coupon_stack as stack,
           case when dr.discount_type = 'percent'
                then round(coalesce(p_base_price, 0) * (dr.discount_value / 100), 2)
                else least(dr.discount_value, coalesce(p_base_price, 0)) end as amount
    from public.discount_rule dr
    where dr.company_id = v_company_id
      and dr.is_active
      and (dr.location_id is null or dr.location_id = p_location_id)
      and (dr.valid_from is null or dr.valid_from <= now())
      and (dr.valid_until is null or dr.valid_until >= now())
      and (dr.min_days is null or coalesce(p_days, 0) >= dr.min_days)
      and (dr.min_amount is null or coalesce(p_base_price, 0) >= dr.min_amount)
      and (dr.advance_days is null or p_check_in_at is null
           or p_check_in_at >= now() + make_interval(days => dr.advance_days))
      and (not exists (select 1 from public.discount_rule_parking_type x
                       where x.discount_rule_id = dr.id)
           or exists (select 1 from public.discount_rule_parking_type x
                      where x.discount_rule_id = dr.id
                        and x.company_parking_type_id = p_company_parking_type_id))
  )
  select e.id, e.amount,
    case when e.discount_type = 'percent'
         then '-' || trim(to_char(e.discount_value, 'FM999990.##')) || '%'
         else '-R$ ' || trim(to_char(e.amount, 'FM999990.00')) end,
    e.stack
  from eligible e
  where e.amount > 0
  order by e.amount desc, e.priority desc, e.sort_order asc
  limit 1;
end; $fe$;

-- 4) Upsert ---------------------------------------------------------------------
create or replace function public.operator_upsert_discount(
  p_company_id uuid,
  p_id uuid,
  p_location_id uuid,
  p_name text,
  p_description text,
  p_discount_type text,
  p_discount_value numeric,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_min_days integer,
  p_min_amount numeric,
  p_advance_days integer,
  p_allow_coupon_stack boolean,
  p_priority integer,
  p_is_active boolean,
  p_sort_order integer,
  p_parking_type_ids uuid[]
) returns uuid language plpgsql security definer set search_path to 'public' as $fu$
declare v_id uuid;
begin
  perform public.discount_assert_company_access(p_company_id);
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome do desconto é obrigatório.' using errcode = 'P0001';
  end if;
  if p_discount_type not in ('percent', 'fixed') then
    raise exception 'Tipo de desconto inválido.' using errcode = 'P0001';
  end if;
  if coalesce(p_discount_value, 0) < 0 then
    raise exception 'Valor do desconto não pode ser negativo.' using errcode = 'P0001';
  end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then
    raise exception 'Desconto percentual não pode passar de 100%%.' using errcode = 'P0001';
  end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'Data final da validade é anterior à inicial.' using errcode = 'P0001';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.location where id = p_location_id and company_id = p_company_id and deleted_at is null
  ) then
    raise exception 'Unidade não pertence a esta empresa.' using errcode = 'P0001';
  end if;

  if p_id is not null then
    update public.discount_rule set
      location_id        = p_location_id,
      name               = trim(p_name),
      description         = nullif(trim(coalesce(p_description, '')), ''),
      discount_type       = p_discount_type::public.discount_type,
      discount_value      = coalesce(p_discount_value, 0),
      valid_from          = p_valid_from,
      valid_until         = p_valid_until,
      min_days            = p_min_days,
      min_amount          = p_min_amount,
      advance_days        = p_advance_days,
      allow_coupon_stack  = coalesce(p_allow_coupon_stack, true),
      priority            = coalesce(p_priority, 0),
      is_active           = coalesce(p_is_active, true),
      sort_order          = coalesce(p_sort_order, 0)
    where id = p_id and company_id = p_company_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Desconto não encontrado nesta empresa.' using errcode = 'P0001';
    end if;
  else
    insert into public.discount_rule
      (company_id, location_id, name, description, discount_type, discount_value,
       valid_from, valid_until, min_days, min_amount, advance_days,
       allow_coupon_stack, priority, is_active, sort_order)
    values (
      p_company_id, p_location_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
      p_discount_type::public.discount_type, coalesce(p_discount_value, 0),
      p_valid_from, p_valid_until, p_min_days, p_min_amount, p_advance_days,
      coalesce(p_allow_coupon_stack, true), coalesce(p_priority, 0),
      coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  end if;

  delete from public.discount_rule_parking_type where discount_rule_id = v_id;
  if p_parking_type_ids is not null and array_length(p_parking_type_ids, 1) > 0 then
    insert into public.discount_rule_parking_type (discount_rule_id, company_parking_type_id)
    select v_id, x from unnest(p_parking_type_ids) as x
    where exists (
      select 1 from public.company_parking_type cpt
      where cpt.id = x and cpt.company_id = p_company_id
    );
  end if;

  return v_id;
end; $fu$;

-- 5) Ativar/desativar -----------------------------------------------------------
create or replace function public.operator_set_discount_active(
  p_discount_rule_id uuid, p_is_active boolean
) returns void language plpgsql security definer set search_path to 'public' as $fs$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.discount_rule where id = p_discount_rule_id;
  if v_company_id is null then
    raise exception 'Desconto não encontrado.' using errcode = 'P0001';
  end if;
  perform public.discount_assert_company_access(v_company_id);
  update public.discount_rule set is_active = coalesce(p_is_active, false) where id = p_discount_rule_id;
end; $fs$;

-- 6) Exclusão (bloqueia se já usado) --------------------------------------------
create or replace function public.operator_delete_discount(p_discount_rule_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fd$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.discount_rule where id = p_discount_rule_id;
  if v_company_id is null then
    raise exception 'Desconto não encontrado.' using errcode = 'P0001';
  end if;
  perform public.discount_assert_company_access(v_company_id);
  if exists (select 1 from public.booking_discount where discount_rule_id = p_discount_rule_id) then
    raise exception 'Desconto já aplicado em reservas; desative-o em vez de excluir.'
      using errcode = 'P0001';
  end if;
  delete from public.discount_rule where id = p_discount_rule_id;
end; $fd$;

-- 7) simulate_price com camada de desconto (preview) ----------------------------
create or replace function public.simulate_price(
  p_company text, p_location text default null, p_parking_type text default null, p_days integer default 1
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $sp$
declare
  v_row         record;
  v_price       numeric;
  v_base        numeric;
  v_old_price   numeric;
  v_price_tiers jsonb;
  v_location_id uuid;
  v_cpt_id      uuid;
  v_disc        record;
  v_disc_obj    jsonb := null;
begin
  select * into v_row from public.get_pricing_data(p_company, p_location, p_parking_type) limit 1;
  if not found then
    return jsonb_build_object(
      'error', format('Tipo de vaga não encontrado: %s / %s / %s', p_company, p_location, p_parking_type));
  end if;

  v_price_tiers := coalesce(
    (select jsonb_agg(t order by (t->>'from_day')::int)
     from jsonb_array_elements(v_row.tiers) t
     where (t->>'is_old_price')::boolean is distinct from true),
    '[]'::jsonb);

  v_price := public._apply_pricing(
    v_row.strategy, v_price_tiers, v_row.source_strategy, v_row.source_tiers,
    v_row.surcharge_multiplier, p_days,
    v_row.incremental_one_day_price, v_row.incremental_two_days_price,
    v_row.incremental_base, v_row.incremental_multiplier,
    v_row.monthly_fixed_price, v_row.monthly_daily_rate, v_row.hourly_daily_rate);

  -- old_price estático (comportamento atual)
  v_old_price := case v_row.old_price_strategy
    when 'multiplier' then round(v_price * v_row.old_price_multiplier::numeric, 2)
    when 'own_table' then public._apply_pricing(
        v_row.strategy,
        coalesce((select jsonb_agg(t order by (t->>'from_day')::int)
                  from jsonb_array_elements(v_row.tiers) t
                  where (t->>'is_old_price')::boolean = true), '[]'::jsonb),
        null, null, null, p_days, null, null, null, null, null, null, null)
    else null end;

  v_base := v_price;

  -- desconto automático (preview, sem check_in → advance_days ignorado)
  select l.id, cpt.id into v_location_id, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where c.slug = p_company and l.slug = p_location and pt.code = p_parking_type
    and lpt.is_active and l.deleted_at is null
  limit 1;

  if v_location_id is not null then
    for v_disc in
      select * from public.discount_evaluate(v_location_id, v_cpt_id, v_base, p_days, null)
    loop
      if coalesce(v_disc.discount, 0) > 0 then
        v_price := v_base - v_disc.discount;
        v_old_price := v_base;  -- desconto tem precedência sobre o old_price estático
        v_disc_obj := jsonb_build_object(
          'rule_id', v_disc.discount_rule_id, 'amount', v_disc.discount, 'label', v_disc.label);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'company',           v_row.company_name,
    'company_slug',      v_row.company_slug,
    'location',          v_row.location_name,
    'location_slug',     v_row.location_slug,
    'parking_type',      v_row.parking_type_name,
    'parking_type_code', v_row.parking_type_code,
    'days',              p_days,
    'base_price',        v_base,
    'price',             v_price,
    'old_price',         v_old_price,
    'discount',          v_disc_obj,
    'currency',          'BRL',
    'strategy',          v_row.strategy);
end; $sp$;

-- 8) create_booking_atomic: desconto autoritativo + snapshot + empilha cupom ----
create or replace function public.create_booking_atomic(
  p_profile_id uuid,
  p_location_parking_type_id uuid,
  p_check_in_at timestamp with time zone,
  p_check_out_at timestamp with time zone,
  p_passenger_count integer default null,
  p_has_pcd boolean default false,
  p_vehicle_id uuid default null,
  p_add_on_ids uuid[] default null,
  p_coupon_code text default null,
  p_origin text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $cba$
declare
  v_lpt_id uuid; v_lpt_capacity int; v_lpt_active boolean;
  v_location_id uuid; v_location_slug text; v_company_slug text;
  v_parking_type_id uuid; v_parking_type_code text; v_cpt_id uuid;
  v_days int; v_total_minutes int; v_date date; v_booked int;
  v_sim jsonb; v_price numeric; v_base numeric; v_old_price numeric; v_subtotal numeric;
  v_code text; v_booking_id uuid; v_expires_at timestamptz;
  v_add_on_id uuid; v_add_on_name text; v_add_on_price numeric;
  v_coupon_id uuid; v_discount numeric := 0; v_total numeric;
  v_line_items jsonb := '[]'::jsonb; v_eval record;
  v_auto_rule uuid; v_auto_discount numeric := 0; v_auto_stack boolean := true; v_disc record;
begin
  select lpt.id, lpt.capacity, lpt.is_active,
         l.id, l.slug, c.slug, pt.id, pt.code, cpt.id
    into v_lpt_id, v_lpt_capacity, v_lpt_active,
         v_location_id, v_location_slug, v_company_slug, v_parking_type_id, v_parking_type_code, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.id = p_location_parking_type_id and l.deleted_at is null;

  if v_lpt_id is null then raise exception 'Tipo de vaga não encontrado' using errcode = 'P0001'; end if;
  if not v_lpt_active then raise exception 'Tipo de vaga desativado' using errcode = 'P0001'; end if;
  if p_check_out_at <= p_check_in_at then
    raise exception 'Check-out precisa ser após o check-in' using errcode = 'P0001';
  end if;

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_total_minutes::numeric / (60 * 24))::int);

  for v_date in
    select generate_series(p_check_in_at::date, (p_check_out_at - interval '1 microsecond')::date, '1 day')::date
  loop
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0) on conflict (location_parking_type_id, date) do nothing;
    select booked_count into v_booked from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date for update;
    if v_booked >= v_lpt_capacity then
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

  -- desconto automático autoritativo (com check_in p/ advance_days)
  for v_disc in
    select * from public.discount_evaluate(v_location_id, v_cpt_id, v_base, v_days, p_check_in_at)
  loop
    v_auto_rule := v_disc.discount_rule_id;
    v_auto_discount := coalesce(v_disc.discount, 0);
    v_auto_stack := coalesce(v_disc.allow_coupon_stack, true);
  end loop;

  v_subtotal := v_base - v_auto_discount;
  if v_auto_discount > 0 then v_old_price := v_base; end if;

  -- cupom (empilha sobre o subtotal já descontado)
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
    total_amount, currency, passenger_count, has_pcd, origin, status, expires_at
  ) values (
    v_code, p_profile_id, v_location_id, p_vehicle_id, p_check_in_at, p_check_out_at,
    v_total, 'BRL', p_passenger_count, p_has_pcd, p_origin, 'pending', v_expires_at
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

  return jsonb_build_object(
    'code', v_code, 'booking_id', v_booking_id, 'total_amount', v_total,
    'subtotal', v_subtotal, 'base_price', v_base,
    'discount', v_discount, 'auto_discount', v_auto_discount,
    'old_price', v_old_price, 'days', v_days, 'expires_at', v_expires_at,
    'line_items', v_line_items);
end; $cba$;

-- 9) Grants ---------------------------------------------------------------------
revoke all on function public.discount_assert_company_access(uuid) from public;
grant all on function public.discount_assert_company_access(uuid) to authenticated, service_role;
revoke all on function public.discount_evaluate(uuid, uuid, numeric, integer, timestamptz) from public;
grant all on function public.discount_evaluate(uuid, uuid, numeric, integer, timestamptz) to authenticated, service_role;
revoke all on function public.operator_upsert_discount(uuid, uuid, uuid, text, text, text, numeric, timestamptz, timestamptz, integer, numeric, integer, boolean, integer, boolean, integer, uuid[]) from public;
grant all on function public.operator_upsert_discount(uuid, uuid, uuid, text, text, text, numeric, timestamptz, timestamptz, integer, numeric, integer, boolean, integer, boolean, integer, uuid[]) to authenticated, service_role;
revoke all on function public.operator_set_discount_active(uuid, boolean) from public;
grant all on function public.operator_set_discount_active(uuid, boolean) to authenticated, service_role;
revoke all on function public.operator_delete_discount(uuid) from public;
grant all on function public.operator_delete_discount(uuid) to authenticated, service_role;
