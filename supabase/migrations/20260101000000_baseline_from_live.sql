-- Baseline gerado do banco vivo (mgaigbezdalbyuqiofcf) em 2026-06-03.
-- Substitui o histórico de migrations divergente. Schema completo (public).
-- Dados de catálogo/pricing ficam em supabase/seed.sql.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."booking_item_type" AS ENUM (
    'parking',
    'add_on'
);


ALTER TYPE "public"."booking_item_type" OWNER TO "postgres";


CREATE TYPE "public"."booking_status" AS ENUM (
    'pending',
    'confirmed',
    'checked_in',
    'completed',
    'cancelled',
    'no_show'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."discount_type" AS ENUM (
    'percent',
    'fixed'
);


ALTER TYPE "public"."discount_type" OWNER TO "postgres";


CREATE TYPE "public"."entity_status" AS ENUM (
    'active',
    'inactive',
    'suspended'
);


ALTER TYPE "public"."entity_status" OWNER TO "postgres";


CREATE TYPE "public"."faq_scope" AS ENUM (
    'global',
    'location'
);


ALTER TYPE "public"."faq_scope" OWNER TO "postgres";


CREATE TYPE "public"."minimum_stay_unit" AS ENUM (
    'minutes',
    'hours',
    'days',
    'months'
);


ALTER TYPE "public"."minimum_stay_unit" OWNER TO "postgres";


CREATE TYPE "public"."onboarding_status" AS ENUM (
    'pending_review',
    'approved',
    'in_progress',
    'active',
    'rejected'
);


ALTER TYPE "public"."onboarding_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'authorized',
    'paid',
    'refunded',
    'failed',
    'cancelled'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'hub_admin',
    'company_operator',
    'customer'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text" DEFAULT NULL::"text", "p_source_tiers" "jsonb" DEFAULT NULL::"jsonb", "p_surcharge_multiplier" double precision DEFAULT NULL::double precision, "p_days" integer DEFAULT 1) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v_tier JSONB;
  v_from_day INT;
  v_to_day INT;
  v_unit_price NUMERIC;
  v_total_price NUMERIC;
  v_price NUMERIC := NULL;
  v_remaining INT;
  v_base NUMERIC;
  v_overflow_unit_price NUMERIC := NULL;
BEGIN
  IF p_strategy = 'tiered_progressive' THEN
    v_remaining := p_days;
    FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) ORDER BY (value->>'from_day')::int LOOP
      v_from_day := (v_tier->>'from_day')::int;
      v_to_day   := NULLIF(v_tier->>'to_day', 'null')::int;
      v_unit_price := (v_tier->>'unit_price')::numeric;
      IF v_remaining <= 0 THEN EXIT; END IF;
      IF v_to_day IS NULL THEN
        v_price := COALESCE(v_price, 0) + v_remaining * v_unit_price;
        v_remaining := 0;
      ELSE
        DECLARE
          v_days_in_tier INT := LEAST(v_remaining, v_to_day - v_from_day + 1);
        BEGIN
          v_price := COALESCE(v_price, 0) + v_days_in_tier * v_unit_price;
          v_remaining := v_remaining - v_days_in_tier;
        END;
      END IF;
    END LOOP;

  ELSIF p_strategy IN ('uniform_by_duration', 'fixed_bracket') THEN
    -- Both strategies: find bracket where p_days falls, apply total_price or days×unit_price.
    -- For infinite bracket (to_day IS NULL): also days×unit_price.
    FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) ORDER BY (value->>'from_day')::int LOOP
      v_from_day    := (v_tier->>'from_day')::int;
      v_to_day      := NULLIF(v_tier->>'to_day', 'null')::int;
      v_unit_price  := (v_tier->>'unit_price')::numeric;
      v_total_price := (v_tier->>'total_price')::numeric;
      IF v_to_day IS NULL OR p_days BETWEEN v_from_day AND v_to_day THEN
        v_price := COALESCE(v_total_price, p_days * v_unit_price);
        EXIT;
      END IF;
    END LOOP;

  ELSIF p_strategy = 'surcharge' THEN
    v_base := public._apply_pricing(p_source_strategy, p_source_tiers, NULL, NULL, NULL, p_days);
    IF v_base IS NOT NULL THEN
      v_price := ROUND((v_base * p_surcharge_multiplier::numeric), 2);
    END IF;
  END IF;

  RETURN v_price;
END;
$$;


ALTER FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text", "p_source_tiers" "jsonb", "p_surcharge_multiplier" double precision, "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text" DEFAULT NULL::"text", "p_source_tiers" "jsonb" DEFAULT NULL::"jsonb", "p_surcharge_multiplier" double precision DEFAULT NULL::double precision, "p_days" integer DEFAULT 1, "p_inc_one_day" double precision DEFAULT NULL::double precision, "p_inc_two_days" double precision DEFAULT NULL::double precision, "p_inc_base" double precision DEFAULT NULL::double precision, "p_inc_mult" double precision DEFAULT NULL::double precision, "p_monthly_fixed" double precision DEFAULT NULL::double precision, "p_monthly_daily" double precision DEFAULT NULL::double precision, "p_hourly_daily" double precision DEFAULT NULL::double precision) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_tier jsonb;
  v_from_day int;
  v_to_day int;
  v_unit_price numeric;
  v_total_price numeric;
  v_price numeric := null;
  v_remaining int;
  v_base numeric;
  v_months int;
  v_rem int;
begin
  if p_strategy = 'tiered_progressive' then
    v_remaining := p_days;
    for v_tier in select * from jsonb_array_elements(p_tiers) order by (value->>'from_day')::int loop
      v_from_day := (v_tier->>'from_day')::int;
      v_to_day   := nullif(v_tier->>'to_day', 'null')::int;
      v_unit_price := (v_tier->>'unit_price')::numeric;
      if v_remaining <= 0 then exit; end if;
      if v_to_day is null then
        v_price := coalesce(v_price, 0) + v_remaining * v_unit_price;
        v_remaining := 0;
      else
        declare
          v_days_in_tier int := least(v_remaining, v_to_day - v_from_day + 1);
        begin
          v_price := coalesce(v_price, 0) + v_days_in_tier * v_unit_price;
          v_remaining := v_remaining - v_days_in_tier;
        end;
      end if;
    end loop;

  elsif p_strategy in ('uniform_by_duration', 'fixed_bracket') then
    for v_tier in select * from jsonb_array_elements(p_tiers) order by (value->>'from_day')::int loop
      v_from_day    := (v_tier->>'from_day')::int;
      v_to_day      := nullif(v_tier->>'to_day', 'null')::int;
      v_unit_price  := (v_tier->>'unit_price')::numeric;
      v_total_price := (v_tier->>'total_price')::numeric;
      if v_to_day is null or p_days between v_from_day and v_to_day then
        v_price := coalesce(v_total_price, p_days * v_unit_price);
        exit;
      end if;
    end loop;

  elsif p_strategy = 'incremental_formula' then
    if p_days = 1 and p_inc_one_day is not null then
      v_price := p_inc_one_day::numeric;
    elsif p_days = 2 and p_inc_two_days is not null then
      v_price := p_inc_two_days::numeric;
    elsif p_inc_base is not null and p_inc_mult is not null then
      v_price := round((p_inc_base + p_days * p_inc_mult)::numeric, 2);
    end if;

  elsif p_strategy = 'monthly_remainder' then
    if p_monthly_fixed is not null then
      -- Regra especial: 15-30 dias → preço do pacote mensal
      if p_days between 15 and 30 then
        v_price := p_monthly_fixed::numeric;
      else
        v_months := floor(p_days::numeric / 30)::int;
        v_rem := p_days - (v_months * 30);
        v_price := round(
          (v_months * p_monthly_fixed + v_rem * coalesce(p_monthly_daily, 0))::numeric,
          2
        );
      end if;
    end if;

  elsif p_strategy = 'hourly_capped' then
    -- Pro simulate_price com p_days, cobra N × teto_diário.
    -- Cálculo granular minuto-a-minuto fica pro motor de booking real.
    if p_hourly_daily is not null then
      v_price := round((p_days * p_hourly_daily)::numeric, 2);
    end if;

  elsif p_strategy = 'surcharge' then
    v_base := public._apply_pricing(
      p_source_strategy, p_source_tiers, null, null, null, p_days,
      null, null, null, null, null, null, null
    );
    if v_base is not null and p_surcharge_multiplier is not null then
      v_price := round((v_base * p_surcharge_multiplier::numeric), 2);
    end if;
  end if;

  return v_price;
end;
$$;


ALTER FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text", "p_source_tiers" "jsonb", "p_surcharge_multiplier" double precision, "p_days" integer, "p_inc_one_day" double precision, "p_inc_two_days" double precision, "p_inc_base" double precision, "p_inc_mult" double precision, "p_monthly_fixed" double precision, "p_monthly_daily" double precision, "p_hourly_daily" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_atomic"("p_profile_id" "uuid", "p_location_parking_type_id" "uuid", "p_check_in_at" timestamp with time zone, "p_check_out_at" timestamp with time zone, "p_passenger_count" integer DEFAULT NULL::integer, "p_has_pcd" boolean DEFAULT false, "p_vehicle_id" "uuid" DEFAULT NULL::"uuid", "p_add_on_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_coupon_code" "text" DEFAULT NULL::"text", "p_origin" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lpt_id              uuid;
  v_lpt_capacity        int;
  v_lpt_active          boolean;
  v_location_id         uuid;
  v_location_slug       text;
  v_company_slug        text;
  v_parking_type_id     uuid;
  v_parking_type_code   text;
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
  v_coupon_type         text;
  v_coupon_value        numeric;
  v_discount            numeric := 0;
  v_total               numeric;
  v_line_items          jsonb := '[]'::jsonb;
begin
  -- 1) Load LPT + slugs
  select lpt.id, lpt.capacity, lpt.is_active,
         l.id, l.slug, c.slug, pt.id, pt.code
    into v_lpt_id, v_lpt_capacity, v_lpt_active,
         v_location_id, v_location_slug, v_company_slug, v_parking_type_id, v_parking_type_code
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

  -- 3) ATOMIC capacity hold:
  --    upsert availability row + SELECT FOR UPDATE + verify + increment.
  --    Loop por cada data no range [check_in_date, check_out_date).
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

  -- 5) Validate coupon if provided
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select c.id, c.discount_type::text, c.discount_value
      into v_coupon_id, v_coupon_type, v_coupon_value
    from public.coupon c
    join public.company comp on comp.id = c.company_id
    join public.location l on l.company_id = comp.id and l.id = v_location_id
    where c.code = trim(p_coupon_code)
      and c.is_active = true
      and (c.valid_from is null or c.valid_from <= now())
      and (c.valid_until is null or c.valid_until >= now())
      and (c.max_uses is null or c.times_used < c.max_uses);

    if v_coupon_id is null then
      raise exception 'Cupom inválido ou expirado' using errcode = 'P0001';
    end if;

    if v_coupon_type = 'percent' then
      v_discount := round(v_subtotal * (v_coupon_value / 100), 2);
    else
      v_discount := least(v_coupon_value, v_subtotal);
    end if;
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

  -- 10) Coupon link
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
end;
$$;


ALTER FUNCTION "public"."create_booking_atomic"("p_profile_id" "uuid", "p_location_parking_type_id" "uuid", "p_check_in_at" timestamp with time zone, "p_check_out_at" timestamp with time zone, "p_passenger_count" integer, "p_has_pcd" boolean, "p_vehicle_id" "uuid", "p_add_on_ids" "uuid"[], "p_coupon_code" "text", "p_origin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_company_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select company_id from public.profile_company where profile_id = auth.uid() $$;


ALTER FUNCTION "public"."current_company_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from profiles where id = auth.uid()
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_unique_company_slug"("p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare base text := nullif(public.slugify(p_name), ''); candidate text; n int := 1;
begin
  base := coalesce(base, 'parceiro'); candidate := base;
  while exists (select 1 from public.company where slug = candidate) loop
    n := n + 1; candidate := base || '-' || n;
  end loop;
  return candidate;
end; $$;


ALTER FUNCTION "public"."generate_unique_company_slug"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_unique_location_slug"("p_company_id" "uuid", "p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare base text := nullif(public.slugify(p_name), ''); candidate text; n int := 1;
begin
  base := coalesce(base, 'unidade'); candidate := base;
  while exists (select 1 from public.location where company_id = p_company_id and slug = candidate) loop
    n := n + 1; candidate := base || '-' || n;
  end loop;
  return candidate;
end; $$;


ALTER FUNCTION "public"."generate_unique_location_slug"("p_company_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pricing_data"("p_company" "text", "p_location" "text" DEFAULT NULL::"text", "p_parking_type" "text" DEFAULT NULL::"text") RETURNS TABLE("company_name" "text", "company_slug" "text", "location_slug" "text", "location_name" "text", "parking_type_code" "text", "parking_type_name" "text", "strategy" "text", "old_price_strategy" "text", "old_price_multiplier" double precision, "surcharge_multiplier" double precision, "source_strategy" "text", "incremental_one_day_price" double precision, "incremental_two_days_price" double precision, "incremental_base" double precision, "incremental_multiplier" double precision, "monthly_fixed_price" double precision, "monthly_daily_rate" double precision, "hourly_daily_rate" double precision, "hourly_hours_per_day" integer, "tiers" "jsonb", "source_tiers" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select
    c.name, c.slug, l.slug, l.name,
    pt.code, pt.name,
    pr.strategy,
    pr.old_price_strategy,
    pr.old_price_multiplier::float8,
    pr.surcharge_multiplier::float8,
    src_pr.strategy as source_strategy,
    pr.incremental_one_day_price::float8,
    pr.incremental_two_days_price::float8,
    pr.incremental_base::float8,
    pr.incremental_multiplier::float8,
    pr.monthly_fixed_price::float8,
    pr.monthly_daily_rate::float8,
    pr.hourly_daily_rate::float8,
    pr.hourly_hours_per_day,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'from_day',    t.from_day,
          'to_day',      t.to_day,
          'unit_price',  t.unit_price::float8,
          'total_price', t.total_price::float8,
          'is_old_price', t.is_old_price
        ) order by t.from_day, t.is_old_price::int
      )
      from pricing_tier t
      where t.pricing_rule_id = pr.id
    ), '[]'::jsonb) as tiers,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'from_day',    st.from_day,
          'to_day',      st.to_day,
          'unit_price',  st.unit_price::float8,
          'total_price', st.total_price::float8,
          'is_old_price', st.is_old_price
        ) order by st.from_day, st.is_old_price::int
      )
      from pricing_tier st
      where st.pricing_rule_id = src_pr.id
    ), '[]'::jsonb) as source_tiers
  from company c
  join location l on l.company_id = c.id and l.deleted_at is null
  join location_parking_type lpt on lpt.location_id = l.id and lpt.is_active = true
  join company_parking_type cpt on cpt.id = lpt.company_parking_type_id and cpt.is_active = true
  join parking_type pt on pt.id = cpt.parking_type_id
  join pricing_rule pr on pr.location_parking_type_id = lpt.id
  left join pricing_rule src_pr on src_pr.location_parking_type_id = pr.surcharge_source_id
  where c.slug = p_company and c.deleted_at is null
    and (p_location is null or l.slug = p_location)
    and (p_parking_type is null or pt.code = p_parking_type)
  order by l.name, pt.name;
$$;


ALTER FUNCTION "public"."get_pricing_data"("p_company" "text", "p_location" "text", "p_parking_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auth_user_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  oauth_name text := COALESCE(
    nullif(meta->>'full_name',''),
    nullif(meta->>'name',''),
    nullif(meta->>'display_name','')
  );
  oauth_avatar text := nullif(meta->>'avatar_url','');
BEGIN
  -- Phone do OTP
  IF NEW.phone IS DISTINCT FROM OLD.phone AND NEW.phone IS NOT NULL THEN
    UPDATE public.profiles
       SET phone = COALESCE(profiles.phone, NEW.phone)
     WHERE id = NEW.id;
  END IF;

  -- Nome/avatar do OAuth (caso entrem em provider link posterior)
  IF oauth_name IS NOT NULL OR oauth_avatar IS NOT NULL THEN
    UPDATE public.profiles
       SET full_name  = COALESCE(profiles.full_name, oauth_name),
           avatar_url = COALESCE(profiles.avatar_url, oauth_avatar)
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_auth_user_updated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  oauth_name text := COALESCE(
    nullif(meta->>'full_name',''),
    nullif(meta->>'name',''),
    nullif(meta->>'display_name','')
  );
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, tax_id, avatar_url)
  VALUES (
    NEW.id,
    oauth_name,
    COALESCE(NEW.phone, nullif(meta->>'phone','')),
    nullif(meta->>'tax_id',''),
    nullif(meta->>'avatar_url','')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = COALESCE(EXCLUDED.full_name,  profiles.full_name),
    phone      = COALESCE(EXCLUDED.phone,      profiles.phone),
    tax_id     = COALESCE(EXCLUDED.tax_id,     profiles.tax_id),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_hub_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'hub_admin') $$;


ALTER FUNCTION "public"."is_hub_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboarding_assert_editable"("p_company_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from public.profile_company where profile_id = auth.uid() and company_id = p_company_id) then
    raise exception 'Sem permissão para editar este cadastro.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.company where id = p_company_id and onboarding_status in ('approved', 'in_progress')) then
    raise exception 'Este cadastro não está em fase de edição.' using errcode = 'P0001';
  end if;
  update public.company set onboarding_status = 'in_progress' where id = p_company_id and onboarding_status = 'approved';
end; $$;


ALTER FUNCTION "public"."onboarding_assert_editable"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboarding_bump_step"("p_company_id" "uuid", "p_step" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.company_onboarding set current_step = greatest(current_step, p_step) where company_id = p_company_id;
$$;


ALTER FUNCTION "public"."onboarding_bump_step"("p_company_id" "uuid", "p_step" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboarding_set_addons"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare rec jsonb; v_addon_id uuid;
begin
  perform public.onboarding_assert_editable(p_company_id);
  if not exists (select 1 from public.location where id = p_location_id and company_id = p_company_id) then
    raise exception 'Localização não pertence a esta empresa.' using errcode = 'P0001';
  end if;
  for rec in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.add_on_service (company_id, code, name, base_price, is_active)
    values (p_company_id, public.slugify(coalesce(nullif(rec->>'code',''), rec->>'name')), trim(rec->>'name'), coalesce((rec->>'base_price')::numeric, 0), false)
    on conflict (company_id, code) do update set name = excluded.name, base_price = excluded.base_price
    returning id into v_addon_id;
    insert into public.location_add_on_service (location_id, add_on_service_id, is_active)
    values (p_location_id, v_addon_id, false)
    on conflict (location_id, add_on_service_id) do nothing;
  end loop;
  perform public.onboarding_bump_step(p_company_id, 5);
end; $$;


ALTER FUNCTION "public"."onboarding_set_addons"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboarding_set_parking_types"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare rec jsonb; v_cpt_id uuid;
begin
  perform public.onboarding_assert_editable(p_company_id);
  if not exists (select 1 from public.location where id = p_location_id and company_id = p_company_id) then
    raise exception 'Localização não pertence a esta empresa.' using errcode = 'P0001';
  end if;
  for rec in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity, is_active)
    values (p_company_id, (rec->>'parking_type_id')::uuid, coalesce((rec->>'base_price')::numeric, 0), coalesce((rec->>'capacity')::integer, 0), false)
    on conflict (company_id, parking_type_id) do update set base_price = excluded.base_price, default_capacity = excluded.default_capacity
    returning id into v_cpt_id;
    insert into public.location_parking_type (location_id, company_parking_type_id, capacity, is_active)
    values (p_location_id, v_cpt_id, coalesce((rec->>'capacity')::integer, 0), false)
    on conflict (location_id, company_parking_type_id) do update set capacity = excluded.capacity;
  end loop;
  perform public.onboarding_bump_step(p_company_id, 3);
end; $$;


ALTER FUNCTION "public"."onboarding_set_parking_types"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboarding_set_pricing"("p_company_id" "uuid", "p_location_parking_type_id" "uuid", "p_strategy" "text", "p_tiers" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare rec jsonb; v_rule_id uuid;
begin
  perform public.onboarding_assert_editable(p_company_id);
  if p_strategy not in ('uniform_by_duration', 'fixed_bracket') then
    raise exception 'Estratégia de preço inválida: %', p_strategy using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
    where lpt.id = p_location_parking_type_id and l.company_id = p_company_id) then
    raise exception 'Tipo de vaga não pertence a esta empresa.' using errcode = 'P0001';
  end if;
  insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy, old_price_strategy)
  values (p_location_parking_type_id, p_strategy, 'any_extra', 'none')
  on conflict (location_parking_type_id) do update set strategy = excluded.strategy
  returning id into v_rule_id;
  delete from public.pricing_tier where pricing_rule_id = v_rule_id and is_old_price = false;
  for rec in select value from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
    values (v_rule_id, coalesce((rec->>'from_day')::integer, 1), (rec->>'to_day')::integer,
      (rec->>'unit_price')::numeric, (rec->>'total_price')::numeric, false);
  end loop;
  perform public.onboarding_bump_step(p_company_id, 4);
end; $$;


ALTER FUNCTION "public"."onboarding_set_pricing"("p_company_id" "uuid", "p_location_parking_type_id" "uuid", "p_strategy" "text", "p_tiers" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboarding_submit"("p_company_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.onboarding_assert_editable(p_company_id);
  if not exists (select 1 from public.location l
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
    where l.company_id = p_company_id and lpt.capacity > 0) then
    raise exception 'Cadastre ao menos um tipo de vaga com capacidade e preço antes de enviar.' using errcode = 'P0001';
  end if;
  update public.company set status = 'active', onboarding_status = 'active' where id = p_company_id;
  update public.location set status = 'active' where company_id = p_company_id;
  update public.company_parking_type set is_active = true where company_id = p_company_id;
  update public.location_parking_type lpt set is_active = true from public.location l
    where lpt.location_id = l.id and l.company_id = p_company_id;
  update public.location_add_on_service las set is_active = true from public.location l
    where las.location_id = l.id and l.company_id = p_company_id;
  update public.add_on_service set is_active = true where company_id = p_company_id;
  update public.company_onboarding set setup_submitted_at = now(), went_live_at = now(), current_step = 6 where company_id = p_company_id;
end; $$;


ALTER FUNCTION "public"."onboarding_submit"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboarding_update_company"("p_company_id" "uuid", "p_name" "text", "p_legal_name" "text" DEFAULT NULL::"text", "p_tax_id" "text" DEFAULT NULL::"text", "p_logo_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.onboarding_assert_editable(p_company_id);
  update public.company set
    name = coalesce(nullif(trim(p_name), ''), name),
    legal_name = nullif(trim(coalesce(p_legal_name, '')), ''),
    tax_id = nullif(trim(coalesce(p_tax_id, '')), ''),
    logo_url = coalesce(p_logo_url, logo_url)
  where id = p_company_id;
  perform public.onboarding_bump_step(p_company_id, 1);
end; $$;


ALTER FUNCTION "public"."onboarding_update_company"("p_company_id" "uuid", "p_name" "text", "p_legal_name" "text", "p_tax_id" "text", "p_logo_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboarding_upsert_location"("p_company_id" "uuid", "p_location_id" "uuid", "p_name" "text", "p_address" "text" DEFAULT NULL::"text", "p_latitude" numeric DEFAULT NULL::numeric, "p_longitude" numeric DEFAULT NULL::numeric, "p_timezone" "text" DEFAULT 'America/Sao_Paulo'::"text", "p_phone" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text", "p_reservation_policy" "text" DEFAULT NULL::"text", "p_photos" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_location_id uuid := p_location_id;
begin
  perform public.onboarding_assert_editable(p_company_id);
  if v_location_id is null then
    insert into public.location (company_id, name, slug, address, latitude, longitude, timezone, status, phone, email, reservation_policy, photos)
    values (p_company_id, trim(p_name), public.generate_unique_location_slug(p_company_id, p_name),
      p_address, p_latitude, p_longitude, coalesce(nullif(trim(coalesce(p_timezone,'')),''), 'America/Sao_Paulo'),
      'inactive', p_phone, p_email, p_reservation_policy, coalesce(p_photos, '[]'::jsonb))
    returning id into v_location_id;
  else
    update public.location set
      name = coalesce(nullif(trim(p_name), ''), name), address = p_address,
      latitude = p_latitude, longitude = p_longitude,
      timezone = coalesce(nullif(trim(coalesce(p_timezone,'')),''), timezone),
      phone = p_phone, email = p_email, reservation_policy = p_reservation_policy,
      photos = coalesce(p_photos, photos)
    where id = v_location_id and company_id = p_company_id;
    if not found then
      raise exception 'Localização não encontrada para esta empresa.' using errcode = 'P0001';
    end if;
  end if;
  perform public.onboarding_bump_step(p_company_id, 2);
  return v_location_id;
end; $$;


ALTER FUNCTION "public"."onboarding_upsert_location"("p_company_id" "uuid", "p_location_id" "uuid", "p_name" "text", "p_address" "text", "p_latitude" numeric, "p_longitude" numeric, "p_timezone" "text", "p_phone" "text", "p_email" "text", "p_reservation_policy" "text", "p_photos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_booking_capacity"("p_booking_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lpt_id uuid;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_date date;
begin
  -- Pega LPT via booking_item parking
  select bi.parking_type_id, b.check_in_at, b.check_out_at
    into v_lpt_id, v_check_in, v_check_out
  from public.booking b
  join public.booking_item bi on bi.booking_id = b.id and bi.item_type = 'parking'
  join public.location l on l.id = b.location_id
  join public.company_parking_type cpt
    on cpt.parking_type_id = bi.parking_type_id and cpt.company_id = l.company_id
  join public.location_parking_type lpt
    on lpt.location_id = l.id and lpt.company_parking_type_id = cpt.id
  where b.id = p_booking_id
  limit 1;

  if v_lpt_id is null then
    return;  -- booking sem item parking ou já desfeito
  end if;

  -- Decrementa cada data
  for v_date in
    select generate_series(
      v_check_in::date,
      (v_check_out - interval '1 microsecond')::date,
      '1 day'
    )::date
  loop
    update public.location_parking_availability
       set booked_count = greatest(0, booked_count - 1)
     where location_parking_type_id = (
       select lpt2.id
       from public.location_parking_type lpt2
       join public.location l on l.id = lpt2.location_id
       join public.booking b on b.location_id = l.id and b.id = p_booking_id
       join public.booking_item bi on bi.booking_id = b.id and bi.item_type = 'parking'
       join public.company_parking_type cpt on cpt.id = lpt2.company_parking_type_id
                                            and cpt.parking_type_id = bi.parking_type_id
       limit 1
     )
     and date = v_date;
  end loop;
end;
$$;


ALTER FUNCTION "public"."release_booking_capacity"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."simulate_price"("p_company" "text", "p_location" "text" DEFAULT NULL::"text", "p_parking_type" "text" DEFAULT NULL::"text", "p_days" integer DEFAULT 1) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
declare
  v_row         record;
  v_price       numeric;
  v_old_price   numeric;
  v_price_tiers jsonb;
begin
  select * into v_row
  from public.get_pricing_data(p_company, p_location, p_parking_type)
  limit 1;

  if not found then
    return jsonb_build_object(
      'error', format('Tipo de vaga não encontrado: %s / %s / %s', p_company, p_location, p_parking_type)
    );
  end if;

  v_price_tiers := coalesce(
    (select jsonb_agg(t order by (t->>'from_day')::int)
     from jsonb_array_elements(v_row.tiers) t
     where (t->>'is_old_price')::boolean is distinct from true),
    '[]'::jsonb
  );

  v_price := public._apply_pricing(
    v_row.strategy,
    v_price_tiers,
    v_row.source_strategy,
    v_row.source_tiers,
    v_row.surcharge_multiplier,
    p_days,
    v_row.incremental_one_day_price,
    v_row.incremental_two_days_price,
    v_row.incremental_base,
    v_row.incremental_multiplier,
    v_row.monthly_fixed_price,
    v_row.monthly_daily_rate,
    v_row.hourly_daily_rate
  );

  v_old_price := case v_row.old_price_strategy
    when 'multiplier' then
      round(v_price * v_row.old_price_multiplier::numeric, 2)
    when 'own_table' then
      public._apply_pricing(
        v_row.strategy,
        coalesce(
          (select jsonb_agg(t order by (t->>'from_day')::int)
           from jsonb_array_elements(v_row.tiers) t
           where (t->>'is_old_price')::boolean = true),
          '[]'::jsonb
        ),
        null, null, null, p_days,
        null, null, null, null, null, null, null
      )
    else null
  end;

  return jsonb_build_object(
    'company',           v_row.company_name,
    'company_slug',      v_row.company_slug,
    'location',          v_row.location_name,
    'location_slug',     v_row.location_slug,
    'parking_type',      v_row.parking_type_name,
    'parking_type_code', v_row.parking_type_code,
    'days',              p_days,
    'price',             v_price,
    'old_price',         v_old_price,
    'currency',          'BRL',
    'strategy',          v_row.strategy
  );
end;
$$;


ALTER FUNCTION "public"."simulate_price"("p_company" "text", "p_location" "text", "p_parking_type" "text", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify"("p_text" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select trim(both '-' from regexp_replace(
    regexp_replace(
      lower(translate(coalesce(p_text, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn')),
      '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'));
$$;


ALTER FUNCTION "public"."slugify"("p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_partner_lead"("p_company_name" "text", "p_contact_name" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_tax_id" "text" DEFAULT NULL::"text", "p_contact_role" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text", "p_state" "text" DEFAULT NULL::"text", "p_estimated_spots" integer DEFAULT NULL::integer, "p_message" "text" DEFAULT NULL::"text", "p_utm_source" "text" DEFAULT NULL::"text", "p_utm_medium" "text" DEFAULT NULL::"text", "p_utm_campaign" "text" DEFAULT NULL::"text", "p_referrer" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_company_id uuid;
begin
  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Nome da empresa é obrigatório.' using errcode = 'P0001';
  end if;
  insert into public.company (name, slug, tax_id, status, onboarding_status)
  values (trim(p_company_name), public.generate_unique_company_slug(p_company_name),
    nullif(trim(coalesce(p_tax_id, '')), ''), 'inactive', 'pending_review')
  returning id into v_company_id;
  insert into public.company_onboarding (
    company_id, contact_name, contact_email, contact_phone, contact_role,
    city, state, estimated_spots, message, utm_source, utm_medium, utm_campaign, referrer)
  values (v_company_id, trim(p_contact_name), lower(trim(p_contact_email)), trim(p_contact_phone), p_contact_role,
    p_city, p_state, p_estimated_spots, p_message, p_utm_source, p_utm_medium, p_utm_campaign, p_referrer);
  return v_company_id;
end; $$;


ALTER FUNCTION "public"."submit_partner_lead"("p_company_name" "text", "p_contact_name" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_tax_id" "text", "p_contact_role" "text", "p_city" "text", "p_state" "text", "p_estimated_spots" integer, "p_message" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text", "p_referrer" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."add_on_service" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "base_price" numeric(12,2) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "add_on_service_base_price_check" CHECK (("base_price" >= (0)::numeric))
);


ALTER TABLE "public"."add_on_service" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "label" "text",
    "postal_code" "text",
    "street" "text" NOT NULL,
    "number" "text",
    "complement" "text",
    "district" "text",
    "city" "text" NOT NULL,
    "state" "text",
    "country" "text" DEFAULT 'BR'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."address" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."amenity" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "category" "text" NOT NULL,
    "sort_order" integer DEFAULT 999 NOT NULL,
    CONSTRAINT "amenity_category_check" CHECK (("category" = ANY (ARRAY['security'::"text", 'service'::"text", 'access'::"text", 'extras'::"text"])))
);


ALTER TABLE "public"."amenity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_setting" (
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_setting" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "check_in_at" timestamp with time zone NOT NULL,
    "check_out_at" timestamp with time zone NOT NULL,
    "status" "public"."booking_status" DEFAULT 'pending'::"public"."booking_status" NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "passenger_count" integer,
    "has_pcd" boolean DEFAULT false NOT NULL,
    "origin" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "external_id" "text",
    "voucher_url" "text",
    "checked_in_at" timestamp with time zone,
    "checked_out_at" timestamp with time zone,
    CONSTRAINT "booking_check" CHECK (("check_out_at" > "check_in_at")),
    CONSTRAINT "booking_total_amount_check" CHECK (("total_amount" >= (0)::numeric))
);


ALTER TABLE "public"."booking" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_coupon" (
    "booking_id" "uuid" NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "discount_applied" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_coupon_discount_applied_check" CHECK (("discount_applied" >= (0)::numeric))
);


ALTER TABLE "public"."booking_coupon" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_item" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "item_type" "public"."booking_item_type" NOT NULL,
    "parking_type_id" "uuid",
    "add_on_service_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "subtotal" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_item_check" CHECK (((("item_type" = 'parking'::"public"."booking_item_type") AND ("parking_type_id" IS NOT NULL) AND ("add_on_service_id" IS NULL)) OR (("item_type" = 'add_on'::"public"."booking_item_type") AND ("add_on_service_id" IS NOT NULL) AND ("parking_type_id" IS NULL)))),
    CONSTRAINT "booking_item_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "booking_item_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "booking_item_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."booking_item" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "legal_name" "text",
    "tax_id" "text",
    "status" "public"."entity_status" DEFAULT 'active'::"public"."entity_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "onboarding_status" "public"."onboarding_status" DEFAULT 'pending_review'::"public"."onboarding_status" NOT NULL,
    "logo_url" "text"
);


ALTER TABLE "public"."company" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_onboarding" (
    "company_id" "uuid" NOT NULL,
    "contact_name" "text" NOT NULL,
    "contact_email" "text" NOT NULL,
    "contact_phone" "text" NOT NULL,
    "contact_role" "text",
    "city" "text",
    "state" "text",
    "estimated_spots" integer,
    "message" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "referrer" "text",
    "current_step" integer DEFAULT 0 NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "rejected_at" timestamp with time zone,
    "rejection_reason" "text",
    "setup_submitted_at" timestamp with time zone,
    "went_live_at" timestamp with time zone,
    "internal_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_onboarding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_parking_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "parking_type_id" "uuid" NOT NULL,
    "base_price" numeric(12,2) NOT NULL,
    "default_capacity" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_parking_type_base_price_check" CHECK (("base_price" >= (0)::numeric)),
    CONSTRAINT "company_parking_type_default_capacity_check" CHECK (("default_capacity" >= 0))
);


ALTER TABLE "public"."company_parking_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupon" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "discount_type" "public"."discount_type" NOT NULL,
    "discount_value" numeric(12,2) NOT NULL,
    "valid_from" timestamp with time zone,
    "valid_until" timestamp with time zone,
    "max_uses" integer,
    "times_used" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coupon_discount_value_check" CHECK (("discount_value" >= (0)::numeric)),
    CONSTRAINT "coupon_max_uses_check" CHECK ((("max_uses" IS NULL) OR ("max_uses" > 0))),
    CONSTRAINT "coupon_times_used_check" CHECK (("times_used" >= 0))
);


ALTER TABLE "public"."coupon" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."destination" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text",
    "type" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text",
    "country" "text" DEFAULT 'BR'::"text" NOT NULL,
    "latitude" numeric NOT NULL,
    "longitude" numeric NOT NULL,
    "is_popular" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 999 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "destination_type_check" CHECK (("type" = ANY (ARRAY['airport'::"text", 'bus_terminal'::"text", 'city_center'::"text", 'district'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."destination" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faq" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "public"."faq_scope" NOT NULL,
    "location_id" "uuid",
    "category_id" "uuid",
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_published" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "faq_check" CHECK (((("scope" = 'global'::"public"."faq_scope") AND ("location_id" IS NULL)) OR (("scope" = 'location'::"public"."faq_scope") AND ("location_id" IS NOT NULL))))
);


ALTER TABLE "public"."faq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faq_category" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."faq_category" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "address" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL,
    "status" "public"."entity_status" DEFAULT 'active'::"public"."entity_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "has_pcd_config" boolean DEFAULT false NOT NULL,
    "has_passenger_quantity" boolean DEFAULT false NOT NULL,
    "reservation_policy" "text",
    "has_notice" boolean DEFAULT false NOT NULL,
    "notice" "text",
    "phone" "text",
    "email" "text",
    "photos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."location" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_add_on_service" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "add_on_service_id" "uuid" NOT NULL,
    "price_override" numeric(12,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "location_add_on_service_price_override_check" CHECK ((("price_override" IS NULL) OR ("price_override" >= (0)::numeric)))
);


ALTER TABLE "public"."location_add_on_service" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_amenity" (
    "location_id" "uuid" NOT NULL,
    "amenity_code" "text" NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."location_amenity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_parking_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_parking_type_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "booked_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "location_parking_availability_booked_count_check" CHECK (("booked_count" >= 0))
);


ALTER TABLE "public"."location_parking_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_parking_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "company_parking_type_id" "uuid" NOT NULL,
    "capacity" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "near_capacity_threshold" integer,
    "near_capacity_message" "text",
    "has_minimum_stay" boolean DEFAULT false NOT NULL,
    "minimum_stay_value" integer,
    "minimum_stay_unit" "public"."minimum_stay_unit",
    "has_minimum_date" boolean DEFAULT false NOT NULL,
    "minimum_date" "date",
    CONSTRAINT "location_parking_type_capacity_check" CHECK (("capacity" >= 0))
);


ALTER TABLE "public"."location_parking_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_photo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "alt_text" "text",
    "sort_order" integer DEFAULT 999 NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_photo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parking_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parking_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_payment_id" "text",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."payment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_method" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'mock'::"text" NOT NULL,
    "provider_token" "text",
    "brand" "text" NOT NULL,
    "last4" "text" NOT NULL,
    "holder_name" "text",
    "expiry_month" integer,
    "expiry_year" integer,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "payment_method_expiry_month_check" CHECK ((("expiry_month" >= 1) AND ("expiry_month" <= 12)))
);


ALTER TABLE "public"."payment_method" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_hourly_bracket" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pricing_rule_id" "uuid" NOT NULL,
    "from_minutes" integer NOT NULL,
    "to_minutes" integer,
    "price" numeric(12,2) NOT NULL,
    "is_old_price" boolean DEFAULT false NOT NULL,
    CONSTRAINT "pricing_hourly_bracket_from_minutes_check" CHECK (("from_minutes" >= 0))
);


ALTER TABLE "public"."pricing_hourly_bracket" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_rule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_parking_type_id" "uuid" NOT NULL,
    "strategy" "text" NOT NULL,
    "fractional_day_policy" "text" DEFAULT 'any_extra'::"text" NOT NULL,
    "fractional_day_tolerance" numeric(5,2),
    "old_price_strategy" "text" DEFAULT 'none'::"text" NOT NULL,
    "old_price_multiplier" numeric(6,4),
    "incremental_one_day_price" numeric(12,2),
    "incremental_two_days_price" numeric(12,2),
    "incremental_base" numeric(12,2),
    "incremental_multiplier" numeric(12,4),
    "monthly_fixed_price" numeric(12,2),
    "monthly_daily_rate" numeric(12,2),
    "hourly_initial_rate" numeric(12,2),
    "hourly_one_hour_rate" numeric(12,2),
    "hourly_fraction_rate" numeric(12,2),
    "hourly_daily_rate" numeric(12,2),
    "hourly_hours_per_day" integer,
    "surcharge_source_id" "uuid",
    "surcharge_multiplier" numeric(6,4),
    "advance_booking_minutes" integer,
    "operating_hours" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pricing_rule_fractional_day_policy_check" CHECK (("fractional_day_policy" = ANY (ARRAY['any_extra'::"text", 'hour_tolerance'::"text", 'threshold_with_minutes'::"text", 'time_of_day'::"text", 'none'::"text"]))),
    CONSTRAINT "pricing_rule_old_price_strategy_check" CHECK (("old_price_strategy" = ANY (ARRAY['none'::"text", 'multiplier'::"text", 'own_table'::"text"]))),
    CONSTRAINT "pricing_rule_strategy_check" CHECK (("strategy" = ANY (ARRAY['tiered_progressive'::"text", 'uniform_by_duration'::"text", 'fixed_bracket'::"text", 'incremental_formula'::"text", 'monthly_remainder'::"text", 'hourly_capped'::"text", 'surcharge'::"text"])))
);


ALTER TABLE "public"."pricing_rule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_tier" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pricing_rule_id" "uuid" NOT NULL,
    "from_day" integer NOT NULL,
    "to_day" integer,
    "unit_price" numeric(12,2),
    "total_price" numeric(12,2),
    "is_old_price" boolean DEFAULT false NOT NULL,
    CONSTRAINT "pricing_tier_check" CHECK ((("unit_price" IS NOT NULL) OR ("total_price" IS NOT NULL))),
    CONSTRAINT "pricing_tier_from_day_check" CHECK (("from_day" >= 1))
);


ALTER TABLE "public"."pricing_tier" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_company" (
    "profile_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_company" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_saved" (
    "profile_id" "uuid" NOT NULL,
    "location_parking_type_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_saved" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "tax_id" "text",
    "phone" "text",
    "birth_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "role" "public"."user_role" DEFAULT 'customer'::"public"."user_role" NOT NULL,
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "avatar_url" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."preferences" IS 'language, notifications, currency, ui prefs';



CREATE TABLE IF NOT EXISTS "public"."review" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "rating_cleanliness" integer,
    "rating_service" integer,
    "rating_value" integer,
    "rating_access" integer,
    "comment" "text",
    "is_published" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_rating_access_check" CHECK ((("rating_access" >= 1) AND ("rating_access" <= 5))),
    CONSTRAINT "review_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "review_rating_cleanliness_check" CHECK ((("rating_cleanliness" >= 1) AND ("rating_cleanliness" <= 5))),
    CONSTRAINT "review_rating_service_check" CHECK ((("rating_service" >= 1) AND ("rating_service" <= 5))),
    CONSTRAINT "review_rating_value_check" CHECK ((("rating_value" >= 1) AND ("rating_value" <= 5)))
);


ALTER TABLE "public"."review" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "license_plate" "text" NOT NULL,
    "model" "text",
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "is_default" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."vehicle" OWNER TO "postgres";


ALTER TABLE ONLY "public"."add_on_service"
    ADD CONSTRAINT "add_on_service_company_id_code_key" UNIQUE ("company_id", "code");



ALTER TABLE ONLY "public"."add_on_service"
    ADD CONSTRAINT "add_on_service_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."address"
    ADD CONSTRAINT "address_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amenity"
    ADD CONSTRAINT "amenity_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."app_setting"
    ADD CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."booking"
    ADD CONSTRAINT "booking_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."booking_coupon"
    ADD CONSTRAINT "booking_coupon_pkey" PRIMARY KEY ("booking_id", "coupon_id");



ALTER TABLE ONLY "public"."booking_item"
    ADD CONSTRAINT "booking_item_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking"
    ADD CONSTRAINT "booking_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_onboarding"
    ADD CONSTRAINT "company_onboarding_pkey" PRIMARY KEY ("company_id");



ALTER TABLE ONLY "public"."company_parking_type"
    ADD CONSTRAINT "company_parking_type_company_id_parking_type_id_key" UNIQUE ("company_id", "parking_type_id");



ALTER TABLE ONLY "public"."company_parking_type"
    ADD CONSTRAINT "company_parking_type_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company"
    ADD CONSTRAINT "company_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company"
    ADD CONSTRAINT "company_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."coupon"
    ADD CONSTRAINT "coupon_company_id_code_key" UNIQUE ("company_id", "code");



ALTER TABLE ONLY "public"."coupon"
    ADD CONSTRAINT "coupon_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."destination"
    ADD CONSTRAINT "destination_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."destination"
    ADD CONSTRAINT "destination_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faq_category"
    ADD CONSTRAINT "faq_category_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faq_category"
    ADD CONSTRAINT "faq_category_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."faq"
    ADD CONSTRAINT "faq_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_add_on_service"
    ADD CONSTRAINT "location_add_on_service_location_id_add_on_service_id_key" UNIQUE ("location_id", "add_on_service_id");



ALTER TABLE ONLY "public"."location_add_on_service"
    ADD CONSTRAINT "location_add_on_service_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_amenity"
    ADD CONSTRAINT "location_amenity_pkey" PRIMARY KEY ("location_id", "amenity_code");



ALTER TABLE ONLY "public"."location"
    ADD CONSTRAINT "location_company_id_slug_key" UNIQUE ("company_id", "slug");



ALTER TABLE ONLY "public"."location_parking_availability"
    ADD CONSTRAINT "location_parking_availability_location_parking_type_id_date_key" UNIQUE ("location_parking_type_id", "date");



ALTER TABLE ONLY "public"."location_parking_availability"
    ADD CONSTRAINT "location_parking_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_parking_type"
    ADD CONSTRAINT "location_parking_type_location_id_company_parking_type_id_key" UNIQUE ("location_id", "company_parking_type_id");



ALTER TABLE ONLY "public"."location_parking_type"
    ADD CONSTRAINT "location_parking_type_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_photo"
    ADD CONSTRAINT "location_photo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location"
    ADD CONSTRAINT "location_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parking_type"
    ADD CONSTRAINT "parking_type_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."parking_type"
    ADD CONSTRAINT "parking_type_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_method"
    ADD CONSTRAINT "payment_method_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_hourly_bracket"
    ADD CONSTRAINT "pricing_hourly_bracket_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_rule"
    ADD CONSTRAINT "pricing_rule_location_parking_type_id_key" UNIQUE ("location_parking_type_id");



ALTER TABLE ONLY "public"."pricing_rule"
    ADD CONSTRAINT "pricing_rule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_tier"
    ADD CONSTRAINT "pricing_tier_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_company"
    ADD CONSTRAINT "profile_company_pkey" PRIMARY KEY ("profile_id", "company_id");



ALTER TABLE ONLY "public"."profile_saved"
    ADD CONSTRAINT "profile_saved_pkey" PRIMARY KEY ("profile_id", "location_parking_type_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review"
    ADD CONSTRAINT "review_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."review"
    ADD CONSTRAINT "review_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle"
    ADD CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id");



CREATE INDEX "add_on_service_company_id_idx" ON "public"."add_on_service" USING "btree" ("company_id");



CREATE UNIQUE INDEX "address_one_default_per_profile" ON "public"."address" USING "btree" ("profile_id") WHERE ("is_default" = true);



CREATE INDEX "address_profile_id_idx" ON "public"."address" USING "btree" ("profile_id");



CREATE INDEX "booking_check_in_at_idx" ON "public"."booking" USING "btree" ("check_in_at");



CREATE INDEX "booking_item_booking_id_idx" ON "public"."booking_item" USING "btree" ("booking_id");



CREATE INDEX "booking_location_id_idx" ON "public"."booking" USING "btree" ("location_id");



CREATE INDEX "booking_profile_id_idx" ON "public"."booking" USING "btree" ("profile_id");



CREATE INDEX "booking_status_idx" ON "public"."booking" USING "btree" ("status");



CREATE INDEX "company_onboarding_email_idx" ON "public"."company_onboarding" USING "btree" ("lower"("contact_email"));



CREATE INDEX "company_onboarding_status_idx" ON "public"."company" USING "btree" ("onboarding_status");



CREATE INDEX "company_onboarding_submitted_at_idx" ON "public"."company_onboarding" USING "btree" ("submitted_at" DESC);



CREATE INDEX "company_parking_type_company_id_idx" ON "public"."company_parking_type" USING "btree" ("company_id");



CREATE INDEX "coupon_company_id_idx" ON "public"."coupon" USING "btree" ("company_id");



CREATE INDEX "destination_is_popular_sort_order_idx" ON "public"."destination" USING "btree" ("is_popular" DESC, "sort_order");



CREATE INDEX "destination_type_country_idx" ON "public"."destination" USING "btree" ("type", "country");



CREATE INDEX "faq_location_id_idx" ON "public"."faq" USING "btree" ("location_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "faq_question_idx" ON "public"."faq" USING "gin" ("question" "extensions"."gin_trgm_ops");



CREATE INDEX "faq_scope_idx" ON "public"."faq" USING "btree" ("scope") WHERE (("deleted_at" IS NULL) AND "is_published");



CREATE INDEX "location_add_on_service_location_id_idx" ON "public"."location_add_on_service" USING "btree" ("location_id");



CREATE INDEX "location_amenity_amenity_code_idx" ON "public"."location_amenity" USING "btree" ("amenity_code");



CREATE INDEX "location_company_id_idx" ON "public"."location" USING "btree" ("company_id");



CREATE INDEX "location_parking_availability_location_parking_type_id_date_idx" ON "public"."location_parking_availability" USING "btree" ("location_parking_type_id", "date");



CREATE INDEX "location_parking_type_location_id_idx" ON "public"."location_parking_type" USING "btree" ("location_id");



CREATE INDEX "location_photo_location_id_sort_order_idx" ON "public"."location_photo" USING "btree" ("location_id", "sort_order");



CREATE INDEX "payment_booking_id_idx" ON "public"."payment" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "payment_method_one_default_per_profile" ON "public"."payment_method" USING "btree" ("profile_id") WHERE (("is_default" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "payment_method_profile_id_idx" ON "public"."payment_method" USING "btree" ("profile_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "payment_status_idx" ON "public"."payment" USING "btree" ("status");



CREATE INDEX "pricing_hourly_bracket_pricing_rule_id_idx" ON "public"."pricing_hourly_bracket" USING "btree" ("pricing_rule_id");



CREATE INDEX "pricing_tier_pricing_rule_id_idx" ON "public"."pricing_tier" USING "btree" ("pricing_rule_id");



CREATE INDEX "profile_saved_location_parking_type_id_idx" ON "public"."profile_saved" USING "btree" ("location_parking_type_id");



CREATE INDEX "review_location_id_is_published_idx" ON "public"."review" USING "btree" ("location_id", "is_published");



CREATE INDEX "review_profile_id_idx" ON "public"."review" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "vehicle_one_default_per_profile" ON "public"."vehicle" USING "btree" ("profile_id") WHERE (("is_default" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "vehicle_profile_id_idx" ON "public"."vehicle" USING "btree" ("profile_id");



CREATE OR REPLACE TRIGGER "add_on_service_set_updated_at" BEFORE UPDATE ON "public"."add_on_service" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "app_setting_set_updated_at" BEFORE UPDATE ON "public"."app_setting" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "booking_item_set_updated_at" BEFORE UPDATE ON "public"."booking_item" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "booking_set_updated_at" BEFORE UPDATE ON "public"."booking" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "company_onboarding_set_updated_at" BEFORE UPDATE ON "public"."company_onboarding" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "company_parking_type_set_updated_at" BEFORE UPDATE ON "public"."company_parking_type" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "company_set_updated_at" BEFORE UPDATE ON "public"."company" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "coupon_set_updated_at" BEFORE UPDATE ON "public"."coupon" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "faq_category_set_updated_at" BEFORE UPDATE ON "public"."faq_category" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "faq_set_updated_at" BEFORE UPDATE ON "public"."faq" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_add_on_service_set_updated_at" BEFORE UPDATE ON "public"."location_add_on_service" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_parking_type_set_updated_at" BEFORE UPDATE ON "public"."location_parking_type" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "location_set_updated_at" BEFORE UPDATE ON "public"."location" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "parking_type_set_updated_at" BEFORE UPDATE ON "public"."parking_type" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "payment_set_updated_at" BEFORE UPDATE ON "public"."payment" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_pricing_rule" BEFORE UPDATE ON "public"."pricing_rule" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vehicle_set_updated_at" BEFORE UPDATE ON "public"."vehicle" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."add_on_service"
    ADD CONSTRAINT "add_on_service_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."address"
    ADD CONSTRAINT "address_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_coupon"
    ADD CONSTRAINT "booking_coupon_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_coupon"
    ADD CONSTRAINT "booking_coupon_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupon"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking_item"
    ADD CONSTRAINT "booking_item_add_on_service_id_fkey" FOREIGN KEY ("add_on_service_id") REFERENCES "public"."add_on_service"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking_item"
    ADD CONSTRAINT "booking_item_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_item"
    ADD CONSTRAINT "booking_item_parking_type_id_fkey" FOREIGN KEY ("parking_type_id") REFERENCES "public"."parking_type"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking"
    ADD CONSTRAINT "booking_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking"
    ADD CONSTRAINT "booking_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking"
    ADD CONSTRAINT "booking_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_onboarding"
    ADD CONSTRAINT "company_onboarding_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_onboarding"
    ADD CONSTRAINT "company_onboarding_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_parking_type"
    ADD CONSTRAINT "company_parking_type_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_parking_type"
    ADD CONSTRAINT "company_parking_type_parking_type_id_fkey" FOREIGN KEY ("parking_type_id") REFERENCES "public"."parking_type"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."coupon"
    ADD CONSTRAINT "coupon_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faq"
    ADD CONSTRAINT "faq_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."faq_category"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."faq"
    ADD CONSTRAINT "faq_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."faq"
    ADD CONSTRAINT "faq_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."faq"
    ADD CONSTRAINT "faq_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."location_add_on_service"
    ADD CONSTRAINT "location_add_on_service_add_on_service_id_fkey" FOREIGN KEY ("add_on_service_id") REFERENCES "public"."add_on_service"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_add_on_service"
    ADD CONSTRAINT "location_add_on_service_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_amenity"
    ADD CONSTRAINT "location_amenity_amenity_code_fkey" FOREIGN KEY ("amenity_code") REFERENCES "public"."amenity"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_amenity"
    ADD CONSTRAINT "location_amenity_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location"
    ADD CONSTRAINT "location_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."location_parking_availability"
    ADD CONSTRAINT "location_parking_availability_location_parking_type_id_fkey" FOREIGN KEY ("location_parking_type_id") REFERENCES "public"."location_parking_type"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_parking_type"
    ADD CONSTRAINT "location_parking_type_company_parking_type_id_fkey" FOREIGN KEY ("company_parking_type_id") REFERENCES "public"."company_parking_type"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_parking_type"
    ADD CONSTRAINT "location_parking_type_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_photo"
    ADD CONSTRAINT "location_photo_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_method"
    ADD CONSTRAINT "payment_method_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_hourly_bracket"
    ADD CONSTRAINT "pricing_hourly_bracket_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."pricing_rule"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_rule"
    ADD CONSTRAINT "pricing_rule_location_parking_type_id_fkey" FOREIGN KEY ("location_parking_type_id") REFERENCES "public"."location_parking_type"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_rule"
    ADD CONSTRAINT "pricing_rule_surcharge_source_id_fkey" FOREIGN KEY ("surcharge_source_id") REFERENCES "public"."location_parking_type"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pricing_tier"
    ADD CONSTRAINT "pricing_tier_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."pricing_rule"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_company"
    ADD CONSTRAINT "profile_company_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_company"
    ADD CONSTRAINT "profile_company_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_saved"
    ADD CONSTRAINT "profile_saved_location_parking_type_id_fkey" FOREIGN KEY ("location_parking_type_id") REFERENCES "public"."location_parking_type"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_saved"
    ADD CONSTRAINT "profile_saved_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review"
    ADD CONSTRAINT "review_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review"
    ADD CONSTRAINT "review_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review"
    ADD CONSTRAINT "review_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle"
    ADD CONSTRAINT "vehicle_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."add_on_service" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "add_on_service_operator_select" ON "public"."add_on_service" FOR SELECT TO "authenticated" USING (("public"."is_hub_admin"() OR ("company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))));



ALTER TABLE "public"."address" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "address_select" ON "public"."address" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."is_hub_admin"()));



CREATE POLICY "address_write" ON "public"."address" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."amenity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "amenity_admin_write" ON "public"."amenity" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



CREATE POLICY "amenity_select" ON "public"."amenity" FOR SELECT USING (true);



ALTER TABLE "public"."app_setting" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_setting_admin_all" ON "public"."app_setting" TO "authenticated" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



ALTER TABLE "public"."booking" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_coupon" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_coupon_owner_select" ON "public"."booking_coupon" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."booking" "b"
  WHERE (("b"."id" = "booking_coupon"."booking_id") AND ("b"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."booking_item" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_item_owner_select" ON "public"."booking_item" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."booking" "b"
  WHERE (("b"."id" = "booking_item"."booking_id") AND ("b"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "booking_item_owner_write" ON "public"."booking_item" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."booking" "b"
  WHERE (("b"."id" = "booking_item"."booking_id") AND ("b"."profile_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."booking" "b"
  WHERE (("b"."id" = "booking_item"."booking_id") AND ("b"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "booking_item_select" ON "public"."booking_item" FOR SELECT USING (("booking_id" IN ( SELECT "booking"."id"
   FROM "public"."booking"
  WHERE ("public"."is_hub_admin"() OR ("booking"."profile_id" = "auth"."uid"()) OR ("booking"."location_id" IN ( SELECT "location"."id"
           FROM "public"."location"
          WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))))));



CREATE POLICY "booking_operator_update" ON "public"."booking" FOR UPDATE USING (("public"."is_hub_admin"() OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "booking_owner_insert" ON "public"."booking" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "booking_owner_select" ON "public"."booking" FOR SELECT TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "booking_owner_update" ON "public"."booking" FOR UPDATE TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "booking_select" ON "public"."booking" FOR SELECT USING (("public"."is_hub_admin"() OR ("profile_id" = "auth"."uid"()) OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "catalog_read_add_on_service" ON "public"."add_on_service" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "catalog_read_company" ON "public"."company" FOR SELECT TO "authenticated", "anon" USING ((("deleted_at" IS NULL) AND ("status" = 'active'::"public"."entity_status") AND ("onboarding_status" = 'active'::"public"."onboarding_status")));



CREATE POLICY "catalog_read_company_parking_type" ON "public"."company_parking_type" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "catalog_read_coupon" ON "public"."coupon" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "catalog_read_location" ON "public"."location" FOR SELECT TO "authenticated", "anon" USING ((("deleted_at" IS NULL) AND ("status" = 'active'::"public"."entity_status")));



CREATE POLICY "catalog_read_location_add_on_service" ON "public"."location_add_on_service" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "catalog_read_location_parking_type" ON "public"."location_parking_type" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "catalog_read_parking_type" ON "public"."parking_type" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."company" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_admin_write" ON "public"."company" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



ALTER TABLE "public"."company_onboarding" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_onboarding_admin_all" ON "public"."company_onboarding" TO "authenticated" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



CREATE POLICY "company_onboarding_operator_select" ON "public"."company_onboarding" FOR SELECT TO "authenticated" USING (("company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids")));



CREATE POLICY "company_onboarding_operator_update" ON "public"."company_onboarding" FOR UPDATE TO "authenticated" USING (("company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))) WITH CHECK (("company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids")));



ALTER TABLE "public"."company_parking_type" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_select" ON "public"."company" FOR SELECT USING (("public"."is_hub_admin"() OR ("id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))));



ALTER TABLE "public"."coupon" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupon_select" ON "public"."coupon" FOR SELECT USING (("public"."is_hub_admin"() OR ("company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))));



CREATE POLICY "cpt_select" ON "public"."company_parking_type" FOR SELECT USING (("public"."is_hub_admin"() OR ("company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))));



ALTER TABLE "public"."destination" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "destination_admin_write" ON "public"."destination" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



CREATE POLICY "destination_select" ON "public"."destination" FOR SELECT USING (true);



ALTER TABLE "public"."faq" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faq_admin_all" ON "public"."faq" TO "authenticated" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



ALTER TABLE "public"."faq_category" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faq_category_admin_all" ON "public"."faq_category" TO "authenticated" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



CREATE POLICY "faq_category_public_select" ON "public"."faq_category" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "faq_operator_delete" ON "public"."faq" FOR DELETE TO "authenticated" USING ((("scope" = 'location'::"public"."faq_scope") AND ("location_id" IN ( SELECT "l"."id"
   FROM "public"."location" "l"
  WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "faq_operator_select" ON "public"."faq" FOR SELECT TO "authenticated" USING ((("scope" = 'location'::"public"."faq_scope") AND ("location_id" IN ( SELECT "l"."id"
   FROM "public"."location" "l"
  WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "faq_operator_update" ON "public"."faq" FOR UPDATE TO "authenticated" USING ((("scope" = 'location'::"public"."faq_scope") AND ("location_id" IN ( SELECT "l"."id"
   FROM "public"."location" "l"
  WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids")))))) WITH CHECK ((("scope" = 'location'::"public"."faq_scope") AND ("location_id" IN ( SELECT "l"."id"
   FROM "public"."location" "l"
  WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "faq_operator_write" ON "public"."faq" FOR INSERT TO "authenticated" WITH CHECK ((("scope" = 'location'::"public"."faq_scope") AND ("location_id" IN ( SELECT "l"."id"
   FROM "public"."location" "l"
  WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "faq_public_select" ON "public"."faq" FOR SELECT TO "authenticated", "anon" USING (("is_published" AND ("deleted_at" IS NULL)));



ALTER TABLE "public"."location" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_add_on_service" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_add_on_service_operator_select" ON "public"."location_add_on_service" FOR SELECT TO "authenticated" USING (("public"."is_hub_admin"() OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "location_admin_write" ON "public"."location" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



ALTER TABLE "public"."location_amenity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_amenity_select" ON "public"."location_amenity" FOR SELECT USING (true);



CREATE POLICY "location_amenity_write" ON "public"."location_amenity" USING (("public"."is_hub_admin"() OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids")))))) WITH CHECK (("public"."is_hub_admin"() OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "location_operator_update" ON "public"."location" FOR UPDATE USING (("public"."is_hub_admin"() OR ("company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))));



ALTER TABLE "public"."location_parking_availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_parking_availability public read" ON "public"."location_parking_availability" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."location_parking_type" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_photo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_photo_select" ON "public"."location_photo" FOR SELECT USING (true);



CREATE POLICY "location_photo_write" ON "public"."location_photo" USING (("public"."is_hub_admin"() OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids")))))) WITH CHECK (("public"."is_hub_admin"() OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "location_select" ON "public"."location" FOR SELECT USING (("public"."is_hub_admin"() OR ("company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))));



CREATE POLICY "lpa_select" ON "public"."location_parking_availability" FOR SELECT USING (("public"."is_hub_admin"() OR ("location_parking_type_id" IN ( SELECT "lpt"."id"
   FROM ("public"."location_parking_type" "lpt"
     JOIN "public"."location" "l" ON (("l"."id" = "lpt"."location_id")))
  WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "lpt_operator_update" ON "public"."location_parking_type" FOR UPDATE USING (("public"."is_hub_admin"() OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



CREATE POLICY "lpt_select" ON "public"."location_parking_type" FOR SELECT USING (("public"."is_hub_admin"() OR ("location_id" IN ( SELECT "location"."id"
   FROM "public"."location"
  WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



ALTER TABLE "public"."parking_type" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parking_type_select" ON "public"."parking_type" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."payment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_method" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_method_select" ON "public"."payment_method" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."is_hub_admin"()));



CREATE POLICY "payment_method_write" ON "public"."payment_method" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "payment_owner_select" ON "public"."payment" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."booking" "b"
  WHERE (("b"."id" = "payment"."booking_id") AND ("b"."profile_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "payment_select" ON "public"."payment" FOR SELECT USING (("booking_id" IN ( SELECT "booking"."id"
   FROM "public"."booking"
  WHERE ("public"."is_hub_admin"() OR ("booking"."profile_id" = "auth"."uid"()) OR ("booking"."location_id" IN ( SELECT "location"."id"
           FROM "public"."location"
          WHERE ("location"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))))));



ALTER TABLE "public"."pricing_hourly_bracket" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_hourly_bracket public read" ON "public"."pricing_hourly_bracket" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "pricing_hourly_bracket_select" ON "public"."pricing_hourly_bracket" FOR SELECT USING (("pricing_rule_id" IN ( SELECT "pricing_rule"."id"
   FROM "public"."pricing_rule"
  WHERE ("public"."is_hub_admin"() OR ("pricing_rule"."location_parking_type_id" IN ( SELECT "lpt"."id"
           FROM ("public"."location_parking_type" "lpt"
             JOIN "public"."location" "l" ON (("l"."id" = "lpt"."location_id")))
          WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))))));



ALTER TABLE "public"."pricing_rule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_rule public read" ON "public"."pricing_rule" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "pricing_rule_select" ON "public"."pricing_rule" FOR SELECT USING (("public"."is_hub_admin"() OR ("location_parking_type_id" IN ( SELECT "lpt"."id"
   FROM ("public"."location_parking_type" "lpt"
     JOIN "public"."location" "l" ON (("l"."id" = "lpt"."location_id")))
  WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))));



ALTER TABLE "public"."pricing_tier" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_tier public read" ON "public"."pricing_tier" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "pricing_tier_select" ON "public"."pricing_tier" FOR SELECT USING (("pricing_rule_id" IN ( SELECT "pricing_rule"."id"
   FROM "public"."pricing_rule"
  WHERE ("public"."is_hub_admin"() OR ("pricing_rule"."location_parking_type_id" IN ( SELECT "lpt"."id"
           FROM ("public"."location_parking_type" "lpt"
             JOIN "public"."location" "l" ON (("l"."id" = "lpt"."location_id")))
          WHERE ("l"."company_id" IN ( SELECT "public"."current_company_ids"() AS "current_company_ids"))))))));



ALTER TABLE "public"."profile_company" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_company_admin_write" ON "public"."profile_company" USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



CREATE POLICY "profile_company_select" ON "public"."profile_company" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."is_hub_admin"()));



CREATE POLICY "profile_owner_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profile_owner_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."profile_saved" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_saved_select" ON "public"."profile_saved" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."is_hub_admin"()));



CREATE POLICY "profile_saved_write" ON "public"."profile_saved" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_hub_admin"()));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) OR "public"."is_hub_admin"()));



ALTER TABLE "public"."review" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_admin_moderate" ON "public"."review" FOR UPDATE USING ("public"."is_hub_admin"()) WITH CHECK ("public"."is_hub_admin"());



CREATE POLICY "review_insert" ON "public"."review" FOR INSERT WITH CHECK ((("profile_id" = "auth"."uid"()) AND ("booking_id" IN ( SELECT "booking"."id"
   FROM "public"."booking"
  WHERE (("booking"."profile_id" = "auth"."uid"()) AND ("booking"."status" = 'completed'::"public"."booking_status"))))));



CREATE POLICY "review_select" ON "public"."review" FOR SELECT USING ((("is_published" = true) OR ("profile_id" = "auth"."uid"()) OR "public"."is_hub_admin"()));



CREATE POLICY "review_update" ON "public"."review" FOR UPDATE USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."vehicle" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_owner_all" ON "public"."vehicle" TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "vehicle_select" ON "public"."vehicle" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."is_hub_admin"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



















































































































































































































































GRANT ALL ON FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text", "p_source_tiers" "jsonb", "p_surcharge_multiplier" double precision, "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text", "p_source_tiers" "jsonb", "p_surcharge_multiplier" double precision, "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text", "p_source_tiers" "jsonb", "p_surcharge_multiplier" double precision, "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text", "p_source_tiers" "jsonb", "p_surcharge_multiplier" double precision, "p_days" integer, "p_inc_one_day" double precision, "p_inc_two_days" double precision, "p_inc_base" double precision, "p_inc_mult" double precision, "p_monthly_fixed" double precision, "p_monthly_daily" double precision, "p_hourly_daily" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text", "p_source_tiers" "jsonb", "p_surcharge_multiplier" double precision, "p_days" integer, "p_inc_one_day" double precision, "p_inc_two_days" double precision, "p_inc_base" double precision, "p_inc_mult" double precision, "p_monthly_fixed" double precision, "p_monthly_daily" double precision, "p_hourly_daily" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_apply_pricing"("p_strategy" "text", "p_tiers" "jsonb", "p_source_strategy" "text", "p_source_tiers" "jsonb", "p_surcharge_multiplier" double precision, "p_days" integer, "p_inc_one_day" double precision, "p_inc_two_days" double precision, "p_inc_base" double precision, "p_inc_mult" double precision, "p_monthly_fixed" double precision, "p_monthly_daily" double precision, "p_hourly_daily" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_atomic"("p_profile_id" "uuid", "p_location_parking_type_id" "uuid", "p_check_in_at" timestamp with time zone, "p_check_out_at" timestamp with time zone, "p_passenger_count" integer, "p_has_pcd" boolean, "p_vehicle_id" "uuid", "p_add_on_ids" "uuid"[], "p_coupon_code" "text", "p_origin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_atomic"("p_profile_id" "uuid", "p_location_parking_type_id" "uuid", "p_check_in_at" timestamp with time zone, "p_check_out_at" timestamp with time zone, "p_passenger_count" integer, "p_has_pcd" boolean, "p_vehicle_id" "uuid", "p_add_on_ids" "uuid"[], "p_coupon_code" "text", "p_origin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_atomic"("p_profile_id" "uuid", "p_location_parking_type_id" "uuid", "p_check_in_at" timestamp with time zone, "p_check_out_at" timestamp with time zone, "p_passenger_count" integer, "p_has_pcd" boolean, "p_vehicle_id" "uuid", "p_add_on_ids" "uuid"[], "p_coupon_code" "text", "p_origin" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_company_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_company_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_company_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_company_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_unique_company_slug"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_unique_company_slug"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_unique_location_slug"("p_company_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_unique_location_slug"("p_company_id" "uuid", "p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pricing_data"("p_company" "text", "p_location" "text", "p_parking_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pricing_data"("p_company" "text", "p_location" "text", "p_parking_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pricing_data"("p_company" "text", "p_location" "text", "p_parking_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_auth_user_updated"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_auth_user_updated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_auth_user_updated"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_auth_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_hub_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_hub_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_hub_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_hub_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboarding_assert_editable"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboarding_assert_editable"("p_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboarding_bump_step"("p_company_id" "uuid", "p_step" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboarding_bump_step"("p_company_id" "uuid", "p_step" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboarding_set_addons"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboarding_set_addons"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboarding_set_addons"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboarding_set_parking_types"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboarding_set_parking_types"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboarding_set_parking_types"("p_company_id" "uuid", "p_location_id" "uuid", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboarding_set_pricing"("p_company_id" "uuid", "p_location_parking_type_id" "uuid", "p_strategy" "text", "p_tiers" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboarding_set_pricing"("p_company_id" "uuid", "p_location_parking_type_id" "uuid", "p_strategy" "text", "p_tiers" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboarding_set_pricing"("p_company_id" "uuid", "p_location_parking_type_id" "uuid", "p_strategy" "text", "p_tiers" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboarding_submit"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboarding_submit"("p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboarding_submit"("p_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboarding_update_company"("p_company_id" "uuid", "p_name" "text", "p_legal_name" "text", "p_tax_id" "text", "p_logo_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboarding_update_company"("p_company_id" "uuid", "p_name" "text", "p_legal_name" "text", "p_tax_id" "text", "p_logo_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboarding_update_company"("p_company_id" "uuid", "p_name" "text", "p_legal_name" "text", "p_tax_id" "text", "p_logo_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboarding_upsert_location"("p_company_id" "uuid", "p_location_id" "uuid", "p_name" "text", "p_address" "text", "p_latitude" numeric, "p_longitude" numeric, "p_timezone" "text", "p_phone" "text", "p_email" "text", "p_reservation_policy" "text", "p_photos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboarding_upsert_location"("p_company_id" "uuid", "p_location_id" "uuid", "p_name" "text", "p_address" "text", "p_latitude" numeric, "p_longitude" numeric, "p_timezone" "text", "p_phone" "text", "p_email" "text", "p_reservation_policy" "text", "p_photos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboarding_upsert_location"("p_company_id" "uuid", "p_location_id" "uuid", "p_name" "text", "p_address" "text", "p_latitude" numeric, "p_longitude" numeric, "p_timezone" "text", "p_phone" "text", "p_email" "text", "p_reservation_policy" "text", "p_photos" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_booking_capacity"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_booking_capacity"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_booking_capacity"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."simulate_price"("p_company" "text", "p_location" "text", "p_parking_type" "text", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."simulate_price"("p_company" "text", "p_location" "text", "p_parking_type" "text", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."simulate_price"("p_company" "text", "p_location" "text", "p_parking_type" "text", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify"("p_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify"("p_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify"("p_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_partner_lead"("p_company_name" "text", "p_contact_name" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_tax_id" "text", "p_contact_role" "text", "p_city" "text", "p_state" "text", "p_estimated_spots" integer, "p_message" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text", "p_referrer" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_partner_lead"("p_company_name" "text", "p_contact_name" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_tax_id" "text", "p_contact_role" "text", "p_city" "text", "p_state" "text", "p_estimated_spots" integer, "p_message" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text", "p_referrer" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."add_on_service" TO "anon";
GRANT ALL ON TABLE "public"."add_on_service" TO "authenticated";
GRANT ALL ON TABLE "public"."add_on_service" TO "service_role";



GRANT ALL ON TABLE "public"."address" TO "anon";
GRANT ALL ON TABLE "public"."address" TO "authenticated";
GRANT ALL ON TABLE "public"."address" TO "service_role";



GRANT ALL ON TABLE "public"."amenity" TO "anon";
GRANT ALL ON TABLE "public"."amenity" TO "authenticated";
GRANT ALL ON TABLE "public"."amenity" TO "service_role";



GRANT ALL ON TABLE "public"."app_setting" TO "anon";
GRANT ALL ON TABLE "public"."app_setting" TO "authenticated";
GRANT ALL ON TABLE "public"."app_setting" TO "service_role";



GRANT ALL ON TABLE "public"."booking" TO "anon";
GRANT ALL ON TABLE "public"."booking" TO "authenticated";
GRANT ALL ON TABLE "public"."booking" TO "service_role";



GRANT ALL ON TABLE "public"."booking_coupon" TO "anon";
GRANT ALL ON TABLE "public"."booking_coupon" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_coupon" TO "service_role";



GRANT ALL ON TABLE "public"."booking_item" TO "anon";
GRANT ALL ON TABLE "public"."booking_item" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_item" TO "service_role";



GRANT ALL ON TABLE "public"."company" TO "anon";
GRANT ALL ON TABLE "public"."company" TO "authenticated";
GRANT ALL ON TABLE "public"."company" TO "service_role";



GRANT ALL ON TABLE "public"."company_onboarding" TO "anon";
GRANT ALL ON TABLE "public"."company_onboarding" TO "authenticated";
GRANT ALL ON TABLE "public"."company_onboarding" TO "service_role";



GRANT ALL ON TABLE "public"."company_parking_type" TO "anon";
GRANT ALL ON TABLE "public"."company_parking_type" TO "authenticated";
GRANT ALL ON TABLE "public"."company_parking_type" TO "service_role";



GRANT ALL ON TABLE "public"."coupon" TO "anon";
GRANT ALL ON TABLE "public"."coupon" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon" TO "service_role";



GRANT ALL ON TABLE "public"."destination" TO "anon";
GRANT ALL ON TABLE "public"."destination" TO "authenticated";
GRANT ALL ON TABLE "public"."destination" TO "service_role";



GRANT ALL ON TABLE "public"."faq" TO "anon";
GRANT ALL ON TABLE "public"."faq" TO "authenticated";
GRANT ALL ON TABLE "public"."faq" TO "service_role";



GRANT ALL ON TABLE "public"."faq_category" TO "anon";
GRANT ALL ON TABLE "public"."faq_category" TO "authenticated";
GRANT ALL ON TABLE "public"."faq_category" TO "service_role";



GRANT ALL ON TABLE "public"."location" TO "anon";
GRANT ALL ON TABLE "public"."location" TO "authenticated";
GRANT ALL ON TABLE "public"."location" TO "service_role";



GRANT ALL ON TABLE "public"."location_add_on_service" TO "anon";
GRANT ALL ON TABLE "public"."location_add_on_service" TO "authenticated";
GRANT ALL ON TABLE "public"."location_add_on_service" TO "service_role";



GRANT ALL ON TABLE "public"."location_amenity" TO "anon";
GRANT ALL ON TABLE "public"."location_amenity" TO "authenticated";
GRANT ALL ON TABLE "public"."location_amenity" TO "service_role";



GRANT ALL ON TABLE "public"."location_parking_availability" TO "anon";
GRANT ALL ON TABLE "public"."location_parking_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."location_parking_availability" TO "service_role";



GRANT ALL ON TABLE "public"."location_parking_type" TO "anon";
GRANT ALL ON TABLE "public"."location_parking_type" TO "authenticated";
GRANT ALL ON TABLE "public"."location_parking_type" TO "service_role";



GRANT ALL ON TABLE "public"."location_photo" TO "anon";
GRANT ALL ON TABLE "public"."location_photo" TO "authenticated";
GRANT ALL ON TABLE "public"."location_photo" TO "service_role";



GRANT ALL ON TABLE "public"."parking_type" TO "anon";
GRANT ALL ON TABLE "public"."parking_type" TO "authenticated";
GRANT ALL ON TABLE "public"."parking_type" TO "service_role";



GRANT ALL ON TABLE "public"."payment" TO "anon";
GRANT ALL ON TABLE "public"."payment" TO "authenticated";
GRANT ALL ON TABLE "public"."payment" TO "service_role";



GRANT ALL ON TABLE "public"."payment_method" TO "anon";
GRANT ALL ON TABLE "public"."payment_method" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_method" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_hourly_bracket" TO "anon";
GRANT ALL ON TABLE "public"."pricing_hourly_bracket" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_hourly_bracket" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_rule" TO "anon";
GRANT ALL ON TABLE "public"."pricing_rule" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_rule" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_tier" TO "anon";
GRANT ALL ON TABLE "public"."pricing_tier" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_tier" TO "service_role";



GRANT ALL ON TABLE "public"."profile_company" TO "anon";
GRANT ALL ON TABLE "public"."profile_company" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_company" TO "service_role";



GRANT ALL ON TABLE "public"."profile_saved" TO "anon";
GRANT ALL ON TABLE "public"."profile_saved" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_saved" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."review" TO "anon";
GRANT ALL ON TABLE "public"."review" TO "authenticated";
GRANT ALL ON TABLE "public"."review" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle" TO "anon";
GRANT ALL ON TABLE "public"."vehicle" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































