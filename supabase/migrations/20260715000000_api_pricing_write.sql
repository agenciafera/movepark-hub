-- Public API — escritas de precificação (E1.4.1) e bloqueio de datas (E1.4.2) via chave mp_
-- (escopo pricing:write), fechando o gap de paridade operator_* ↔ api_*. Espelham
-- operator_set_pricing/operator_set_date_blocked, mas são keyed por company_id (o gateway já
-- autorizou empresa + escopo) e validam que o tipo de vaga pertence à empresa da chave —
-- sem member_has_scope (não há auth.uid() no contexto service_role). Ver public-api.md §9,
-- mcp.md §4 (ADR-003).

-- E1.4.1 · api_set_pricing → pricing:write
create or replace function public.api_set_pricing(
  p_company_id uuid,
  p_location_parking_type_id uuid,
  p_base_price numeric default null,
  p_rule jsonb default '{}'::jsonb,
  p_tiers jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_cpt_id uuid;
  v_rule_id uuid;
  rec jsonb;
begin
  select l.company_id, lpt.company_parking_type_id
    into v_company_id, v_cpt_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = p_location_parking_type_id;
  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if v_company_id <> p_company_id then
    raise exception 'Tipo de vaga não pertence à empresa da chave.' using errcode = '42501';
  end if;

  if p_base_price is not null then
    update public.company_parking_type set base_price = p_base_price where id = v_cpt_id;
  end if;

  insert into public.pricing_rule (
    location_parking_type_id, strategy, fractional_day_policy, fractional_day_tolerance,
    old_price_strategy, old_price_multiplier, advance_booking_minutes,
    incremental_one_day_price, incremental_two_days_price, incremental_base, incremental_multiplier,
    monthly_fixed_price, monthly_daily_rate,
    hourly_initial_rate, hourly_one_hour_rate, hourly_fraction_rate, hourly_daily_rate, hourly_hours_per_day,
    surcharge_source_id, surcharge_multiplier
  ) values (
    p_location_parking_type_id,
    coalesce(p_rule->>'strategy', 'uniform_by_duration'),
    coalesce(p_rule->>'fractional_day_policy', 'any_extra'),
    (p_rule->>'fractional_day_tolerance')::numeric,
    coalesce(p_rule->>'old_price_strategy', 'none'),
    (p_rule->>'old_price_multiplier')::numeric,
    (p_rule->>'advance_booking_minutes')::int,
    (p_rule->>'incremental_one_day_price')::numeric,
    (p_rule->>'incremental_two_days_price')::numeric,
    (p_rule->>'incremental_base')::numeric,
    (p_rule->>'incremental_multiplier')::numeric,
    (p_rule->>'monthly_fixed_price')::numeric,
    (p_rule->>'monthly_daily_rate')::numeric,
    (p_rule->>'hourly_initial_rate')::numeric,
    (p_rule->>'hourly_one_hour_rate')::numeric,
    (p_rule->>'hourly_fraction_rate')::numeric,
    (p_rule->>'hourly_daily_rate')::numeric,
    (p_rule->>'hourly_hours_per_day')::int,
    nullif(p_rule->>'surcharge_source_id', '')::uuid,
    (p_rule->>'surcharge_multiplier')::numeric
  )
  on conflict (location_parking_type_id) do update set
    strategy = excluded.strategy,
    fractional_day_policy = excluded.fractional_day_policy,
    fractional_day_tolerance = excluded.fractional_day_tolerance,
    old_price_strategy = excluded.old_price_strategy,
    old_price_multiplier = excluded.old_price_multiplier,
    advance_booking_minutes = excluded.advance_booking_minutes,
    incremental_one_day_price = excluded.incremental_one_day_price,
    incremental_two_days_price = excluded.incremental_two_days_price,
    incremental_base = excluded.incremental_base,
    incremental_multiplier = excluded.incremental_multiplier,
    monthly_fixed_price = excluded.monthly_fixed_price,
    monthly_daily_rate = excluded.monthly_daily_rate,
    hourly_initial_rate = excluded.hourly_initial_rate,
    hourly_one_hour_rate = excluded.hourly_one_hour_rate,
    hourly_fraction_rate = excluded.hourly_fraction_rate,
    hourly_daily_rate = excluded.hourly_daily_rate,
    hourly_hours_per_day = excluded.hourly_hours_per_day,
    surcharge_source_id = excluded.surcharge_source_id,
    surcharge_multiplier = excluded.surcharge_multiplier
  returning id into v_rule_id;

  delete from public.pricing_tier where pricing_rule_id = v_rule_id and is_old_price = false;
  for rec in select value from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
    values (v_rule_id, coalesce((rec->>'from_day')::int, 1), (rec->>'to_day')::int,
      (rec->>'unit_price')::numeric, (rec->>'total_price')::numeric, false);
  end loop;

  return jsonb_build_object(
    'location_parking_type_id', p_location_parking_type_id,
    'pricing_rule_id', v_rule_id,
    'base_price', (select base_price from public.company_parking_type where id = v_cpt_id),
    'tiers', (select count(*) from public.pricing_tier where pricing_rule_id = v_rule_id and is_old_price = false)
  );
end;
$$;

revoke all on function public.api_set_pricing(uuid, uuid, numeric, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.api_set_pricing(uuid, uuid, numeric, jsonb, jsonb) to service_role;

-- E1.4.2 · api_set_date_blocked → pricing:write
create or replace function public.api_set_date_blocked(
  p_company_id uuid,
  p_location_parking_type_id uuid,
  p_date date,
  p_blocked boolean
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company_id uuid;
begin
  select l.company_id into v_company_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = p_location_parking_type_id;
  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if v_company_id <> p_company_id then
    raise exception 'Tipo de vaga não pertence à empresa da chave.' using errcode = '42501';
  end if;

  insert into public.location_parking_availability (location_parking_type_id, date, booked_count, blocked)
  values (p_location_parking_type_id, p_date, 0, p_blocked)
  on conflict (location_parking_type_id, date) do update set blocked = excluded.blocked;

  return jsonb_build_object(
    'location_parking_type_id', p_location_parking_type_id,
    'date', p_date,
    'blocked', p_blocked
  );
end;
$$;

revoke all on function public.api_set_date_blocked(uuid, uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.api_set_date_blocked(uuid, uuid, date, boolean) to service_role;

-- webhooks:write — config de webhook (E2.6) é hub_admin-only (segredo fica no Manager); até o
-- épico expor uma RPC api_*, o escopo NÃO é atribuível a chave de API (evita escopo órfão).
update public.api_scope set assignable_to_api_key = false where scope = 'webhooks:write';
