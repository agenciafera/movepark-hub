-- Motor de cupons & descontos (Fase 1 + Fase 2). Ver docs/specs/coupon-rules.md.
-- Fecha o ciclo: incremento de uso no pagamento; regra única (coupon_evaluate)
-- reusada por create_booking_atomic e validate_coupon; gestão pelo operator via
-- RPCs SECURITY DEFINER (escrita sem RLS direta) + elegibilidade.
-- Obs.: dollar-quotes nomeados ($fa$/$fe$/$fu$/$fs$/$fd$/$fv$/$fp$) — o aplicador
-- de migration faz split ingênuo por blocos $$ anônimos.

-- 1) Schema: ordenação, descrição e elegibilidade ----------------------------
alter table public.coupon
  add column if not exists sort_order     integer not null default 0,
  add column if not exists description     text,
  add column if not exists per_user_limit  integer,
  add column if not exists min_amount      numeric(12,2),
  add column if not exists min_days        integer;

do $$ begin
  alter table public.coupon add constraint coupon_per_user_limit_check
    check (per_user_limit is null or per_user_limit > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.coupon add constraint coupon_min_amount_check
    check (min_amount is null or min_amount >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.coupon add constraint coupon_min_days_check
    check (min_days is null or min_days >= 1);
exception when duplicate_object then null; end $$;

create index if not exists coupon_company_code_idx
  on public.coupon (company_id, lower(code));

-- Restrição opcional por tipo de vaga (sem linhas = vale para todos) ----------
create table if not exists public.coupon_parking_type (
  coupon_id               uuid not null references public.coupon(id) on delete cascade,
  company_parking_type_id uuid not null references public.company_parking_type(id) on delete cascade,
  primary key (coupon_id, company_parking_type_id)
);
alter table public.coupon_parking_type enable row level security;
do $$ begin
  create policy coupon_parking_type_operator_select on public.coupon_parking_type
    for select using (
      public.is_hub_admin() or exists (
        select 1 from public.coupon c
        where c.id = coupon_parking_type.coupon_id
          and c.company_id in (select public.current_company_ids())
      )
    );
exception when duplicate_object then null; end $$;

-- 2) Guard de escopo ---------------------------------------------------------
create or replace function public.coupon_assert_company_access(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fa$
begin
  if public.is_hub_admin() then return; end if;
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para gerenciar cupons desta empresa.'
      using errcode = '42501';
  end if;
end; $fa$;

-- 3) Regra única de avaliação (preview + autoritativa) -----------------------
create or replace function public.coupon_evaluate(
  p_code text,
  p_location_id uuid,
  p_profile_id uuid,
  p_subtotal numeric,
  p_days integer,
  p_company_parking_type_id uuid
) returns table(coupon_id uuid, discount numeric, error_code text)
-- VOLATILE de propósito: chamada aninhada dentro de create_booking_atomic (que faz
-- escritas antes); STABLE usaria um snapshot que não enxerga cupom recém-criado na
-- mesma transação. É read-only, então o custo é nulo.
language plpgsql security definer set search_path to 'public' as $fe$
declare
  c record;
  v_company_id uuid;
  v_uses int;
  v_disc numeric;
begin
  select l.company_id into v_company_id from public.location l where l.id = p_location_id;

  select * into c from public.coupon
  where company_id = v_company_id and lower(code) = lower(trim(coalesce(p_code, '')))
  limit 1;

  if c.id is null then
    return query select null::uuid, 0::numeric, 'invalid'::text; return;
  end if;
  if not c.is_active then
    return query select null::uuid, 0::numeric, 'inactive'::text; return;
  end if;
  if c.valid_from is not null and c.valid_from > now() then
    return query select null::uuid, 0::numeric, 'not_yet_valid'::text; return;
  end if;
  if c.valid_until is not null and c.valid_until < now() then
    return query select null::uuid, 0::numeric, 'expired'::text; return;
  end if;
  if c.max_uses is not null and c.times_used >= c.max_uses then
    return query select null::uuid, 0::numeric, 'exhausted'::text; return;
  end if;
  if c.min_days is not null and coalesce(p_days, 0) < c.min_days then
    return query select null::uuid, 0::numeric, 'min_days'::text; return;
  end if;
  if c.min_amount is not null and coalesce(p_subtotal, 0) < c.min_amount then
    return query select null::uuid, 0::numeric, 'min_amount'::text; return;
  end if;
  if exists (select 1 from public.coupon_parking_type x where x.coupon_id = c.id) then
    if p_company_parking_type_id is null or not exists (
      select 1 from public.coupon_parking_type x
      where x.coupon_id = c.id and x.company_parking_type_id = p_company_parking_type_id
    ) then
      return query select null::uuid, 0::numeric, 'not_eligible_type'::text; return;
    end if;
  end if;
  if c.per_user_limit is not null and p_profile_id is not null then
    select count(*) into v_uses
    from public.booking_coupon bc
    join public.booking b on b.id = bc.booking_id
    where bc.coupon_id = c.id and b.profile_id = p_profile_id and b.status <> 'cancelled';
    if v_uses >= c.per_user_limit then
      return query select null::uuid, 0::numeric, 'already_used'::text; return;
    end if;
  end if;

  if c.discount_type = 'percent' then
    v_disc := round(coalesce(p_subtotal, 0) * (c.discount_value / 100), 2);
  else
    v_disc := least(c.discount_value, coalesce(p_subtotal, 0));
  end if;
  if v_disc < 0 then v_disc := 0; end if;

  return query select c.id, v_disc, null::text;
end; $fe$;

-- 4) Upsert do catálogo ------------------------------------------------------
create or replace function public.operator_upsert_coupon(
  p_company_id uuid,
  p_id uuid,
  p_code text,
  p_description text,
  p_discount_type text,
  p_discount_value numeric,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_max_uses integer,
  p_is_active boolean,
  p_sort_order integer,
  p_per_user_limit integer,
  p_min_amount numeric,
  p_min_days integer,
  p_parking_type_ids uuid[]
) returns uuid language plpgsql security definer set search_path to 'public' as $fu$
declare v_id uuid; v_code text;
begin
  perform public.coupon_assert_company_access(p_company_id);
  v_code := upper(nullif(trim(coalesce(p_code, '')), ''));
  if v_code is null then
    raise exception 'Código do cupom é obrigatório.' using errcode = 'P0001';
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

  if p_id is not null then
    update public.coupon set
      code           = v_code,
      description     = nullif(trim(coalesce(p_description, '')), ''),
      discount_type   = p_discount_type::public.discount_type,
      discount_value  = coalesce(p_discount_value, 0),
      valid_from      = p_valid_from,
      valid_until     = p_valid_until,
      max_uses        = p_max_uses,
      is_active       = coalesce(p_is_active, true),
      sort_order      = coalesce(p_sort_order, 0),
      per_user_limit  = p_per_user_limit,
      min_amount      = p_min_amount,
      min_days        = p_min_days
    where id = p_id and company_id = p_company_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Cupom não encontrado nesta empresa.' using errcode = 'P0001';
    end if;
  else
    insert into public.coupon
      (company_id, code, description, discount_type, discount_value, valid_from, valid_until,
       max_uses, is_active, sort_order, per_user_limit, min_amount, min_days)
    values (
      p_company_id, v_code, nullif(trim(coalesce(p_description, '')), ''),
      p_discount_type::public.discount_type, coalesce(p_discount_value, 0),
      p_valid_from, p_valid_until, p_max_uses, coalesce(p_is_active, true),
      coalesce(p_sort_order, 0), p_per_user_limit, p_min_amount, p_min_days)
    on conflict (company_id, code) do update set
      description     = excluded.description,
      discount_type   = excluded.discount_type,
      discount_value  = excluded.discount_value,
      valid_from      = excluded.valid_from,
      valid_until     = excluded.valid_until,
      max_uses        = excluded.max_uses,
      is_active       = excluded.is_active,
      sort_order      = excluded.sort_order,
      per_user_limit  = excluded.per_user_limit,
      min_amount      = excluded.min_amount,
      min_days        = excluded.min_days
    returning id into v_id;
  end if;

  -- sincroniza restrição por tipo de vaga (apenas tipos da própria empresa)
  delete from public.coupon_parking_type where coupon_id = v_id;
  if p_parking_type_ids is not null and array_length(p_parking_type_ids, 1) > 0 then
    insert into public.coupon_parking_type (coupon_id, company_parking_type_id)
    select v_id, x from unnest(p_parking_type_ids) as x
    where exists (
      select 1 from public.company_parking_type cpt
      where cpt.id = x and cpt.company_id = p_company_id
    );
  end if;

  return v_id;
end; $fu$;

-- 5) Ativar/desativar --------------------------------------------------------
create or replace function public.operator_set_coupon_active(
  p_coupon_id uuid, p_is_active boolean
) returns void language plpgsql security definer set search_path to 'public' as $fs$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.coupon where id = p_coupon_id;
  if v_company_id is null then
    raise exception 'Cupom não encontrado.' using errcode = 'P0001';
  end if;
  perform public.coupon_assert_company_access(v_company_id);
  update public.coupon set is_active = coalesce(p_is_active, false) where id = p_coupon_id;
end; $fs$;

-- 6) Exclusão (bloqueia se já usado em reserva) ------------------------------
create or replace function public.operator_delete_coupon(p_coupon_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fd$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.coupon where id = p_coupon_id;
  if v_company_id is null then
    raise exception 'Cupom não encontrado.' using errcode = 'P0001';
  end if;
  perform public.coupon_assert_company_access(v_company_id);
  if exists (select 1 from public.booking_coupon where coupon_id = p_coupon_id) then
    raise exception 'Cupom já usado em reservas; desative-o em vez de excluir.'
      using errcode = 'P0001';
  end if;
  delete from public.coupon where id = p_coupon_id;  -- coupon_parking_type cascateia
end; $fd$;

-- 7) Preview no checkout (não grava) -----------------------------------------
create or replace function public.validate_coupon(
  p_code text,
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz
) returns jsonb language plpgsql security definer set search_path to 'public' as $fv$
declare
  v_location_id uuid; v_location_slug text; v_company_slug text;
  v_parking_type_code text; v_cpt_id uuid;
  v_days int; v_minutes int; v_sim jsonb; v_subtotal numeric; v_eval record;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('valid', false, 'error_code', 'invalid');
  end if;
  if p_check_out_at <= p_check_in_at then
    return jsonb_build_object('valid', false, 'error_code', 'invalid');
  end if;

  select l.id, l.slug, c.slug, pt.code, cpt.id
    into v_location_id, v_location_slug, v_company_slug, v_parking_type_code, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.id = p_location_parking_type_id and l.deleted_at is null;

  if v_location_id is null then
    return jsonb_build_object('valid', false, 'error_code', 'invalid');
  end if;

  v_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_minutes::numeric / (60 * 24))::int);
  v_sim := public.simulate_price(v_company_slug, v_location_slug, v_parking_type_code, v_days);
  v_subtotal := nullif(v_sim ->> 'price', '')::numeric;
  if v_subtotal is null then
    return jsonb_build_object('valid', false, 'error_code', 'invalid');
  end if;

  select * into v_eval from public.coupon_evaluate(
    trim(p_code), v_location_id, auth.uid(), v_subtotal, v_days, v_cpt_id);

  if v_eval.error_code is not null then
    return jsonb_build_object('valid', false, 'error_code', v_eval.error_code);
  end if;

  return jsonb_build_object(
    'valid', true,
    'discount', v_eval.discount,
    'subtotal', v_subtotal,
    'total_preview', v_subtotal - v_eval.discount,
    'code', upper(trim(p_code)),
    'error_code', null
  ) || coalesce((
    select jsonb_build_object('discount_type', co.discount_type, 'discount_value', co.discount_value)
    from public.coupon co where co.id = v_eval.coupon_id
  ), '{}'::jsonb);
end; $fv$;

-- 8) Incremento de uso quando o pagamento é confirmado -----------------------
create or replace function public.coupon_bump_on_payment()
returns trigger language plpgsql security definer set search_path to 'public' as $fp$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    update public.coupon c
       set times_used = times_used + 1
      from public.booking_coupon bc
     where bc.booking_id = new.booking_id and bc.coupon_id = c.id;
  end if;
  return new;
end; $fp$;

drop trigger if exists payment_bump_coupon on public.payment;
create trigger payment_bump_coupon
  after insert or update of status on public.payment
  for each row execute function public.coupon_bump_on_payment();

-- 9) Refactor create_booking_atomic: usa coupon_evaluate (regra única) -------
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
  v_lpt_id              uuid;
  v_lpt_capacity        int;
  v_lpt_active          boolean;
  v_location_id         uuid;
  v_location_slug       text;
  v_company_slug        text;
  v_parking_type_id     uuid;
  v_parking_type_code   text;
  v_cpt_id              uuid;
  v_days                int;
  v_total_minutes       int;
  v_date                date;
  v_booked              int;
  v_sim                 jsonb;
  v_price               numeric;
  v_old_price           numeric;
  v_subtotal            numeric;
  v_code                text;
  v_booking_id          uuid;
  v_expires_at          timestamptz;
  v_add_on_id           uuid;
  v_add_on_name         text;
  v_add_on_price        numeric;
  v_coupon_id           uuid;
  v_discount            numeric := 0;
  v_total               numeric;
  v_line_items          jsonb := '[]'::jsonb;
  v_eval                record;
begin
  -- 1) Load LPT + slugs (+ company_parking_type id p/ restrição de cupom)
  select lpt.id, lpt.capacity, lpt.is_active,
         l.id, l.slug, c.slug, pt.id, pt.code, cpt.id
    into v_lpt_id, v_lpt_capacity, v_lpt_active,
         v_location_id, v_location_slug, v_company_slug, v_parking_type_id, v_parking_type_code, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.id = p_location_parking_type_id
    and l.deleted_at is null;

  if v_lpt_id is null then
    raise exception 'Tipo de vaga não encontrado' using errcode = 'P0001';
  end if;
  if not v_lpt_active then
    raise exception 'Tipo de vaga desativado' using errcode = 'P0001';
  end if;

  -- 2) Validate dates
  if p_check_out_at <= p_check_in_at then
    raise exception 'Check-out precisa ser após o check-in' using errcode = 'P0001';
  end if;

  v_total_minutes := extract(epoch from (p_check_out_at - p_check_in_at)) / 60;
  v_days := greatest(1, ceil(v_total_minutes::numeric / (60 * 24))::int);

  -- 3) ATOMIC capacity hold
  for v_date in
    select generate_series(
      p_check_in_at::date,
      (p_check_out_at - interval '1 microsecond')::date,
      '1 day'
    )::date
  loop
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count)
    values (v_lpt_id, v_date, 0)
    on conflict (location_parking_type_id, date) do nothing;

    select booked_count into v_booked
    from public.location_parking_availability
    where location_parking_type_id = v_lpt_id and date = v_date
    for update;

    if v_booked >= v_lpt_capacity then
      raise exception 'Sem disponibilidade para %', v_date using errcode = 'P0001';
    end if;

    update public.location_parking_availability
       set booked_count = booked_count + 1
     where location_parking_type_id = v_lpt_id and date = v_date;
  end loop;

  -- 4) Simulate parking price snapshot
  v_sim := public.simulate_price(v_company_slug, v_location_slug, v_parking_type_code, v_days);
  v_price := (v_sim ->> 'price')::numeric;
  v_old_price := nullif(v_sim ->> 'old_price', '')::numeric;

  if v_price is null then
    raise exception 'Preço indisponível para essa configuração' using errcode = 'P0001';
  end if;

  v_subtotal := v_price;

  -- 5) Cupom via motor único (mesma regra do preview)
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_eval from public.coupon_evaluate(
      trim(p_coupon_code), v_location_id, p_profile_id, v_subtotal, v_days, v_cpt_id);
    if v_eval.error_code is not null then
      raise exception 'Cupom inválido ou expirado' using errcode = 'P0001';
    end if;
    v_coupon_id := v_eval.coupon_id;
    v_discount := coalesce(v_eval.discount, 0);
  end if;

  -- 6) Generate booking code
  v_code := 'MP-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 6));
  v_expires_at := now() + interval '30 minutes';
  v_total := v_subtotal - v_discount;

  -- 7) Insert booking (status pending)
  insert into public.booking (
    code, profile_id, location_id, vehicle_id,
    check_in_at, check_out_at,
    total_amount, currency,
    passenger_count, has_pcd, origin,
    status, expires_at
  ) values (
    v_code, p_profile_id, v_location_id, p_vehicle_id,
    p_check_in_at, p_check_out_at,
    v_total, 'BRL',
    p_passenger_count, p_has_pcd, p_origin,
    'pending', v_expires_at
  ) returning id into v_booking_id;

  -- 8) Parking item
  insert into public.booking_item (booking_id, item_type, parking_type_id, quantity, unit_price, subtotal)
  values (v_booking_id, 'parking', v_parking_type_id, 1, v_price, v_price);

  v_line_items := v_line_items || jsonb_build_object(
    'kind', 'parking',
    'name', v_parking_type_code,
    'quantity', 1,
    'unit_price', v_price,
    'subtotal', v_price
  );

  -- 9) Add-ons
  if p_add_on_ids is not null and array_length(p_add_on_ids, 1) > 0 then
    foreach v_add_on_id in array p_add_on_ids loop
      select a.name, coalesce(las.price_override, a.base_price)
        into v_add_on_name, v_add_on_price
      from public.add_on_service a
      join public.location_add_on_service las on las.add_on_service_id = a.id
      where a.id = v_add_on_id
        and a.is_active = true
        and las.location_id = v_location_id
        and las.is_active = true;

      if v_add_on_name is not null then
        insert into public.booking_item (booking_id, item_type, add_on_service_id, quantity, unit_price, subtotal)
        values (v_booking_id, 'add_on', v_add_on_id, 1, v_add_on_price, v_add_on_price);

        update public.booking set total_amount = total_amount + v_add_on_price where id = v_booking_id;
        v_total := v_total + v_add_on_price;

        v_line_items := v_line_items || jsonb_build_object(
          'kind', 'add_on',
          'name', v_add_on_name,
          'quantity', 1,
          'unit_price', v_add_on_price,
          'subtotal', v_add_on_price
        );
      end if;
    end loop;
  end if;

  -- 10) Coupon link (snapshot)
  if v_coupon_id is not null and v_discount > 0 then
    insert into public.booking_coupon (booking_id, coupon_id, discount_applied)
    values (v_booking_id, v_coupon_id, v_discount);
  end if;

  return jsonb_build_object(
    'code',          v_code,
    'booking_id',    v_booking_id,
    'total_amount',  v_total,
    'subtotal',      v_subtotal,
    'discount',      v_discount,
    'old_price',     v_old_price,
    'days',          v_days,
    'expires_at',    v_expires_at,
    'line_items',    v_line_items
  );
end; $cba$;

-- 10) Grants (revogar PUBLIC + conceder a authenticated/service_role) ---------
revoke all on function public.coupon_assert_company_access(uuid) from public;
grant all on function public.coupon_assert_company_access(uuid) to authenticated, service_role;

revoke all on function public.coupon_evaluate(text, uuid, uuid, numeric, integer, uuid) from public;
grant all on function public.coupon_evaluate(text, uuid, uuid, numeric, integer, uuid) to authenticated, service_role;

revoke all on function public.operator_upsert_coupon(uuid, uuid, text, text, text, numeric, timestamptz, timestamptz, integer, boolean, integer, integer, numeric, integer, uuid[]) from public;
grant all on function public.operator_upsert_coupon(uuid, uuid, text, text, text, numeric, timestamptz, timestamptz, integer, boolean, integer, integer, numeric, integer, uuid[]) to authenticated, service_role;

revoke all on function public.operator_set_coupon_active(uuid, boolean) from public;
grant all on function public.operator_set_coupon_active(uuid, boolean) to authenticated, service_role;

revoke all on function public.operator_delete_coupon(uuid) from public;
grant all on function public.operator_delete_coupon(uuid) to authenticated, service_role;

revoke all on function public.validate_coupon(text, uuid, timestamptz, timestamptz) from public;
grant all on function public.validate_coupon(text, uuid, timestamptz, timestamptz) to authenticated, service_role;
