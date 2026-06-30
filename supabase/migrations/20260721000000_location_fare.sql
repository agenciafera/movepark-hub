-- E2.8-f · Configuração de Tarifa por unidade: preço (override) + liga/desliga, sobrepondo o
-- catálogo global (tabela `fare`). O resolver get_unit_fares passa a aplicar o override por unidade,
-- e _create_booking_core usa o preço efetivo da unidade (senão o checkout mostraria um preço e
-- cobraria outro). Escrita gateada por pricing:write (ADR-005), via RPC operator_set_unit_fare.

create table public.location_fare (
  location_parking_type_id uuid not null references public.location_parking_type(id) on delete cascade,
  tier                     public.fare_tier not null references public.fare(tier),
  enabled                  boolean not null default true,
  price_cents_override     integer check (price_cents_override is null or price_cents_override >= 0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  primary key (location_parking_type_id, tier)
);

create trigger location_fare_set_updated_at
  before update on public.location_fare for each row execute function public.set_updated_at();

alter table public.location_fare enable row level security;
create policy "location_fare_select" on public.location_fare for select using (true);
create policy "location_fare_admin" on public.location_fare
  using (public.is_hub_admin()) with check (public.is_hub_admin());

-- Resolver com overlay por unidade: preço efetivo = coalesce(override, catálogo); filtra desabilitadas.
create or replace function public.get_unit_fares(p_location_parking_type_id uuid default null)
returns table (
  tier                  public.fare_tier,
  label                 text,
  price_cents           integer,
  is_popular            boolean,
  sort_order            integer,
  cancel_window_minutes integer,
  benefits              jsonb
) language sql stable security definer set search_path to 'public' as $$
  select f.tier, f.label,
         coalesce(lf.price_cents_override, f.price_cents) as price_cents,
         f.is_popular, f.sort_order, f.cancel_window_minutes, f.benefits
  from public.fare f
  left join public.location_fare lf
    on lf.tier = f.tier and lf.location_parking_type_id = p_location_parking_type_id
  where f.is_active = true
    and (p_location_parking_type_id is null or coalesce(lf.enabled, true) = true)
  order by f.sort_order;
$$;

revoke all on function public.get_unit_fares(uuid) from public;
grant execute on function public.get_unit_fares(uuid) to anon, authenticated, service_role;

-- RPC de config por unidade (operador com pricing:write ou hub_admin). Espelha operator_set_pricing.
create or replace function public.operator_set_unit_fare(
  p_location_parking_type_id uuid,
  p_tier public.fare_tier,
  p_enabled boolean,
  p_price_cents integer default null
) returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_company_id uuid;
begin
  select l.company_id into v_company_id
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  where lpt.id = p_location_parking_type_id;
  if v_company_id is null then
    raise exception 'Tipo de vaga não encontrado.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin() and v_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão para editar Tarifas desta unidade.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'pricing:write') then
    raise exception 'Seu papel não permite editar preços (pricing:write).' using errcode = '42501';
  end if;
  if p_price_cents is not null and p_price_cents < 0 then
    raise exception 'Preço inválido.' using errcode = 'P0001';
  end if;

  insert into public.location_fare (location_parking_type_id, tier, enabled, price_cents_override)
  values (p_location_parking_type_id, p_tier, coalesce(p_enabled, true), p_price_cents)
  on conflict (location_parking_type_id, tier) do update
    set enabled = excluded.enabled,
        price_cents_override = excluded.price_cents_override,
        updated_at = now();
end; $fn$;

revoke all on function public.operator_set_unit_fare(uuid, public.fare_tier, boolean, integer) from public;
grant execute on function public.operator_set_unit_fare(uuid, public.fare_tier, boolean, integer) to authenticated, service_role;

-- _create_booking_core: usa o preço/on-off efetivo da UNIDADE para a Tarifa (consistência com o
-- checkout). Mesma assinatura → create or replace (sem drop). Demais regras inalteradas.
create or replace function public._create_booking_core(
  p_profile_id uuid, p_created_via_api_key_id uuid, p_customer_name text, p_customer_email text,
  p_customer_phone text, p_location_parking_type_id uuid, p_check_in_at timestamptz,
  p_check_out_at timestamptz, p_passenger_count integer, p_has_pcd boolean, p_vehicle_id uuid,
  p_add_on_ids uuid[], p_coupon_code text, p_origin text, p_fare_tier public.fare_tier default 'basica'
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
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
  v_fare public.fare; v_fare_tier public.fare_tier; v_fare_price numeric := 0;
  v_fare_cancel_until timestamptz;
  v_lf_enabled boolean; v_lf_override int; v_eff_fare_cents int;
begin
  v_fare_tier := coalesce(p_fare_tier, 'basica');
  select * into v_fare from public.fare where tier = v_fare_tier and is_active = true;
  if v_fare.tier is null then
    raise exception 'Tarifa indisponível.' using errcode = 'P0001';
  end if;
  -- Override por unidade (E2.8-f): on/off + preço; cai no catálogo quando não há override.
  select enabled, price_cents_override into v_lf_enabled, v_lf_override
  from public.location_fare
  where location_parking_type_id = p_location_parking_type_id and tier = v_fare_tier;
  if v_lf_enabled is not null and v_lf_enabled = false then
    raise exception 'Tarifa indisponível nesta unidade.' using errcode = 'P0001';
  end if;
  v_eff_fare_cents := coalesce(v_lf_override, v_fare.price_cents);
  v_fare_price := v_eff_fare_cents / 100.0;
  if v_fare.cancel_window_minutes is not null then
    v_fare_cancel_until := p_check_in_at - (v_fare.cancel_window_minutes || ' minutes')::interval;
  end if;

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
  v_total := v_subtotal - v_discount + v_fare_price;

  insert into public.booking (
    code, profile_id, location_id, vehicle_id, check_in_at, check_out_at,
    total_amount, currency, passenger_count, has_pcd, origin, status, expires_at,
    created_via_api_key_id, customer_name, customer_email, customer_phone,
    fare_tier, fare_price_cents, fare_cancel_until, fare_benefits
  ) values (
    v_code, p_profile_id, v_location_id, p_vehicle_id, p_check_in_at, p_check_out_at,
    v_total, 'BRL', p_passenger_count, p_has_pcd, p_origin, 'pending', v_expires_at,
    p_created_via_api_key_id, p_customer_name, p_customer_email, p_customer_phone,
    v_fare_tier, v_eff_fare_cents, v_fare_cancel_until, v_fare.benefits
  ) returning id into v_booking_id;

  insert into public.booking_item (booking_id, item_type, parking_type_id, quantity, unit_price, subtotal)
  values (v_booking_id, 'parking', v_parking_type_id, 1, v_subtotal, v_subtotal);

  v_line_items := v_line_items || jsonb_build_object(
    'kind', 'parking', 'name', v_parking_type_code, 'quantity', 1,
    'unit_price', v_subtotal, 'subtotal', v_subtotal);

  if v_fare_price > 0 then
    v_line_items := v_line_items || jsonb_build_object(
      'kind', 'fare', 'name', v_fare.label, 'tier', v_fare_tier, 'quantity', 1,
      'unit_price', v_fare_price, 'subtotal', v_fare_price);
  end if;

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
    'fare', case when v_fare_price > 0
      then jsonb_build_object('tier', v_fare_tier, 'label', v_fare.label, 'amount', v_fare_price)
      else null end,
    'total', v_total,
    'line_items', v_line_items);
  update public.booking set price_breakdown = v_breakdown where id = v_booking_id;

  return jsonb_build_object(
    'code', v_code, 'booking_id', v_booking_id, 'total_amount', v_total,
    'subtotal', v_subtotal, 'base_price', v_base,
    'discount', v_discount, 'auto_discount', v_auto_discount,
    'old_price', v_old_price, 'days', v_days, 'expires_at', v_expires_at,
    'fare_tier', v_fare_tier, 'fare_price', v_fare_price, 'fare_cancel_until', v_fare_cancel_until,
    'line_items', v_line_items, 'price_breakdown', v_breakdown);
end; $function$;
