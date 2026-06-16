-- Public API / MCP — expansão de superfície (E0.7). Ver docs/specs/public-api.md.
-- Paridade do parceiro: cupons, descontos, add-ons, avaliações, ocupação e escritas de
-- unidade/tipo de vaga. RPCs api_* (service_role, chamadas pelo gateway/MCP já autorizado
-- por chave+escopo) ESPELHAM a lógica dos operator_* keyed por company_id — sem auth.uid()
-- (o gateway já resolveu a empresa). Mantêm os operator_* intactos (testados). Mantenha as
-- duas em sincronia ao mudar a regra (doc-as-you-build).

-- ── Escopos novos no catálogo ────────────────────────────────────────────────
insert into public.api_scope (scope, module, description) values
  ('discounts:read',  'discounts', 'Ler descontos automáticos'),
  ('discounts:write', 'discounts', 'Gerir descontos automáticos'),
  ('addons:read',     'addons',    'Ler serviços adicionais'),
  ('addons:write',    'addons',    'Gerir serviços adicionais'),
  ('occupancy:read',  'occupancy', 'Consultar ocupação por data')
on conflict (scope) do update set module = excluded.module, description = excluded.description;

-- ════════════════════════════════════════════════════════════════════════════
-- CUPONS
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_list_coupons(p_company_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $alc$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'code', c.code, 'description', c.description,
    'discount_type', c.discount_type, 'discount_value', c.discount_value,
    'valid_from', c.valid_from, 'valid_until', c.valid_until,
    'max_uses', c.max_uses, 'times_used', c.times_used, 'is_active', c.is_active,
    'per_user_limit', c.per_user_limit, 'min_amount', c.min_amount, 'min_days', c.min_days
  ) order by c.sort_order, c.code), '[]'::jsonb)
  from public.coupon c where c.company_id = p_company_id;
$alc$;

create or replace function public.api_upsert_coupon(
  p_company_id uuid, p_id uuid, p_code text, p_description text, p_discount_type text,
  p_discount_value numeric, p_valid_from timestamptz, p_valid_until timestamptz,
  p_max_uses integer, p_is_active boolean, p_sort_order integer, p_per_user_limit integer,
  p_min_amount numeric, p_min_days integer, p_parking_type_ids uuid[]
) returns uuid language plpgsql security definer set search_path to 'public' as $auc$
declare v_id uuid; v_code text;
begin
  v_code := upper(nullif(trim(coalesce(p_code, '')), ''));
  if v_code is null then raise exception 'Código do cupom é obrigatório.' using errcode = 'P0001'; end if;
  if p_discount_type not in ('percent', 'fixed') then raise exception 'Tipo de desconto inválido.' using errcode = 'P0001'; end if;
  if coalesce(p_discount_value, 0) < 0 then raise exception 'Valor do desconto não pode ser negativo.' using errcode = 'P0001'; end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then raise exception 'Desconto percentual não pode passar de 100%%.' using errcode = 'P0001'; end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'Data final da validade é anterior à inicial.' using errcode = 'P0001'; end if;

  if p_id is not null then
    update public.coupon set
      code = v_code, description = nullif(trim(coalesce(p_description, '')), ''),
      discount_type = p_discount_type::public.discount_type, discount_value = coalesce(p_discount_value, 0),
      valid_from = p_valid_from, valid_until = p_valid_until, max_uses = p_max_uses,
      is_active = coalesce(p_is_active, true), sort_order = coalesce(p_sort_order, 0),
      per_user_limit = p_per_user_limit, min_amount = p_min_amount, min_days = p_min_days
    where id = p_id and company_id = p_company_id returning id into v_id;
    if v_id is null then raise exception 'Cupom não encontrado nesta empresa.' using errcode = 'P0001'; end if;
  else
    insert into public.coupon
      (company_id, code, description, discount_type, discount_value, valid_from, valid_until,
       max_uses, is_active, sort_order, per_user_limit, min_amount, min_days)
    values (p_company_id, v_code, nullif(trim(coalesce(p_description, '')), ''),
       p_discount_type::public.discount_type, coalesce(p_discount_value, 0), p_valid_from, p_valid_until,
       p_max_uses, coalesce(p_is_active, true), coalesce(p_sort_order, 0), p_per_user_limit, p_min_amount, p_min_days)
    on conflict (company_id, code) do update set
      description = excluded.description, discount_type = excluded.discount_type,
      discount_value = excluded.discount_value, valid_from = excluded.valid_from,
      valid_until = excluded.valid_until, max_uses = excluded.max_uses, is_active = excluded.is_active,
      sort_order = excluded.sort_order, per_user_limit = excluded.per_user_limit,
      min_amount = excluded.min_amount, min_days = excluded.min_days
    returning id into v_id;
  end if;

  delete from public.coupon_parking_type where coupon_id = v_id;
  if p_parking_type_ids is not null and array_length(p_parking_type_ids, 1) > 0 then
    insert into public.coupon_parking_type (coupon_id, company_parking_type_id)
    select v_id, x from unnest(p_parking_type_ids) as x
    where exists (select 1 from public.company_parking_type cpt where cpt.id = x and cpt.company_id = p_company_id);
  end if;
  return v_id;
end; $auc$;

create or replace function public.api_set_coupon_active(p_company_id uuid, p_coupon_id uuid, p_is_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $asc$
begin
  update public.coupon set is_active = coalesce(p_is_active, false)
  where id = p_coupon_id and company_id = p_company_id;
  if not found then raise exception 'Cupom não encontrado nesta empresa.' using errcode = 'P0001'; end if;
end; $asc$;

create or replace function public.api_delete_coupon(p_company_id uuid, p_coupon_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $adc$
begin
  if not exists (select 1 from public.coupon where id = p_coupon_id and company_id = p_company_id) then
    raise exception 'Cupom não encontrado nesta empresa.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.booking_coupon where coupon_id = p_coupon_id) then
    raise exception 'Cupom já usado em reservas; desative-o em vez de excluir.' using errcode = 'P0001'; end if;
  delete from public.coupon where id = p_coupon_id and company_id = p_company_id;
end; $adc$;

-- ════════════════════════════════════════════════════════════════════════════
-- DESCONTOS
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_list_discounts(p_company_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $ald$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'location_id', d.location_id, 'name', d.name, 'description', d.description,
    'discount_type', d.discount_type, 'discount_value', d.discount_value,
    'valid_from', d.valid_from, 'valid_until', d.valid_until, 'min_days', d.min_days,
    'min_amount', d.min_amount, 'advance_days', d.advance_days,
    'allow_coupon_stack', d.allow_coupon_stack, 'priority', d.priority, 'is_active', d.is_active
  ) order by d.priority, d.name), '[]'::jsonb)
  from public.discount_rule d where d.company_id = p_company_id;
$ald$;

create or replace function public.api_upsert_discount(
  p_company_id uuid, p_id uuid, p_location_id uuid, p_name text, p_description text,
  p_discount_type text, p_discount_value numeric, p_valid_from timestamptz, p_valid_until timestamptz,
  p_min_days integer, p_min_amount numeric, p_advance_days integer, p_allow_coupon_stack boolean,
  p_priority integer, p_is_active boolean, p_sort_order integer, p_parking_type_ids uuid[]
) returns uuid language plpgsql security definer set search_path to 'public' as $aud$
declare v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Nome do desconto é obrigatório.' using errcode = 'P0001'; end if;
  if p_discount_type not in ('percent', 'fixed') then raise exception 'Tipo de desconto inválido.' using errcode = 'P0001'; end if;
  if coalesce(p_discount_value, 0) < 0 then raise exception 'Valor do desconto não pode ser negativo.' using errcode = 'P0001'; end if;
  if p_discount_type = 'percent' and p_discount_value > 100 then raise exception 'Desconto percentual não pode passar de 100%%.' using errcode = 'P0001'; end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'Data final da validade é anterior à inicial.' using errcode = 'P0001'; end if;
  if p_location_id is not null and not exists (
    select 1 from public.location where id = p_location_id and company_id = p_company_id and deleted_at is null) then
    raise exception 'Unidade não pertence a esta empresa.' using errcode = 'P0001'; end if;

  if p_id is not null then
    update public.discount_rule set
      location_id = p_location_id, name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
      discount_type = p_discount_type::public.discount_type, discount_value = coalesce(p_discount_value, 0),
      valid_from = p_valid_from, valid_until = p_valid_until, min_days = p_min_days, min_amount = p_min_amount,
      advance_days = p_advance_days, allow_coupon_stack = coalesce(p_allow_coupon_stack, true),
      priority = coalesce(p_priority, 0), is_active = coalesce(p_is_active, true), sort_order = coalesce(p_sort_order, 0)
    where id = p_id and company_id = p_company_id returning id into v_id;
    if v_id is null then raise exception 'Desconto não encontrado nesta empresa.' using errcode = 'P0001'; end if;
  else
    insert into public.discount_rule
      (company_id, location_id, name, description, discount_type, discount_value, valid_from, valid_until,
       min_days, min_amount, advance_days, allow_coupon_stack, priority, is_active, sort_order)
    values (p_company_id, p_location_id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
       p_discount_type::public.discount_type, coalesce(p_discount_value, 0), p_valid_from, p_valid_until,
       p_min_days, p_min_amount, p_advance_days, coalesce(p_allow_coupon_stack, true), coalesce(p_priority, 0),
       coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  end if;

  delete from public.discount_rule_parking_type where discount_rule_id = v_id;
  if p_parking_type_ids is not null and array_length(p_parking_type_ids, 1) > 0 then
    insert into public.discount_rule_parking_type (discount_rule_id, company_parking_type_id)
    select v_id, x from unnest(p_parking_type_ids) as x
    where exists (select 1 from public.company_parking_type cpt where cpt.id = x and cpt.company_id = p_company_id);
  end if;
  return v_id;
end; $aud$;

create or replace function public.api_set_discount_active(p_company_id uuid, p_discount_rule_id uuid, p_is_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $asd$
begin
  update public.discount_rule set is_active = coalesce(p_is_active, false)
  where id = p_discount_rule_id and company_id = p_company_id;
  if not found then raise exception 'Desconto não encontrado nesta empresa.' using errcode = 'P0001'; end if;
end; $asd$;

create or replace function public.api_delete_discount(p_company_id uuid, p_discount_rule_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $add$
begin
  if not exists (select 1 from public.discount_rule where id = p_discount_rule_id and company_id = p_company_id) then
    raise exception 'Desconto não encontrado nesta empresa.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.booking_discount where discount_rule_id = p_discount_rule_id) then
    raise exception 'Desconto já aplicado em reservas; desative-o em vez de excluir.' using errcode = 'P0001'; end if;
  delete from public.discount_rule where id = p_discount_rule_id and company_id = p_company_id;
end; $add$;

-- ════════════════════════════════════════════════════════════════════════════
-- ADD-ONS (serviços adicionais)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_list_addons(p_company_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $ala$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'description', a.description,
    'base_price', a.base_price, 'is_active', a.is_active, 'sort_order', a.sort_order,
    'locations', coalesce((select jsonb_agg(jsonb_build_object(
        'location_id', las.location_id, 'is_active', las.is_active, 'price_override', las.price_override))
      from public.location_add_on_service las where las.add_on_service_id = a.id), '[]'::jsonb)
  ) order by a.sort_order, a.name), '[]'::jsonb)
  from public.add_on_service a where a.company_id = p_company_id;
$ala$;

create or replace function public.api_upsert_addon(
  p_company_id uuid, p_id uuid, p_code text, p_name text, p_description text,
  p_base_price numeric, p_is_active boolean, p_sort_order integer
) returns uuid language plpgsql security definer set search_path to 'public' as $aua$
declare v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Nome do serviço é obrigatório.' using errcode = 'P0001'; end if;
  if p_id is not null then
    update public.add_on_service set
      name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''),
      base_price = coalesce(p_base_price, 0), is_active = coalesce(p_is_active, true),
      sort_order = coalesce(p_sort_order, 0), code = coalesce(nullif(trim(coalesce(p_code, '')), ''), code)
    where id = p_id and company_id = p_company_id returning id into v_id;
    if v_id is null then raise exception 'Serviço não encontrado nesta empresa.' using errcode = 'P0001'; end if;
  else
    insert into public.add_on_service (company_id, code, name, description, base_price, is_active, sort_order)
    values (p_company_id, public.slugify(coalesce(nullif(trim(coalesce(p_code, '')), ''), p_name)),
       trim(p_name), nullif(trim(coalesce(p_description, '')), ''), coalesce(p_base_price, 0),
       coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    on conflict (company_id, code) do update set
      name = excluded.name, description = excluded.description, base_price = excluded.base_price,
      is_active = excluded.is_active, sort_order = excluded.sort_order
    returning id into v_id;
  end if;
  return v_id;
end; $aua$;

create or replace function public.api_set_location_addon(
  p_company_id uuid, p_add_on_service_id uuid, p_location_id uuid, p_is_active boolean, p_price_override numeric
) returns void language plpgsql security definer set search_path to 'public' as $asla$
begin
  if not exists (select 1 from public.add_on_service where id = p_add_on_service_id and company_id = p_company_id) then
    raise exception 'Serviço não encontrado nesta empresa.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.location where id = p_location_id and company_id = p_company_id and deleted_at is null) then
    raise exception 'Unidade não pertence a esta empresa.' using errcode = 'P0001'; end if;
  insert into public.location_add_on_service (location_id, add_on_service_id, is_active, price_override)
  values (p_location_id, p_add_on_service_id, coalesce(p_is_active, false), p_price_override)
  on conflict (location_id, add_on_service_id) do update set
    is_active = excluded.is_active, price_override = excluded.price_override;
end; $asla$;

create or replace function public.api_delete_addon(p_company_id uuid, p_add_on_service_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $ada$
begin
  if not exists (select 1 from public.add_on_service where id = p_add_on_service_id and company_id = p_company_id) then
    raise exception 'Serviço não encontrado nesta empresa.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.booking_item where add_on_service_id = p_add_on_service_id) then
    raise exception 'Serviço já usado em reservas; desative-o em vez de excluir.' using errcode = 'P0001'; end if;
  delete from public.add_on_service where id = p_add_on_service_id and company_id = p_company_id;
end; $ada$;

-- ════════════════════════════════════════════════════════════════════════════
-- AVALIAÇÕES
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_list_reviews(p_company_id uuid, p_limit integer default 50)
returns jsonb language sql stable security definer set search_path to 'public' as $alr$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'location_id', r.location_id, 'rating', r.rating, 'comment', r.comment,
    'is_published', r.is_published, 'owner_response', r.owner_response,
    'owner_response_at', r.owner_response_at, 'created_at', r.created_at
  ) order by r.created_at desc), '[]'::jsonb)
  from (
    select r.* from public.review r
    join public.location l on l.id = r.location_id
    where l.company_id = p_company_id
    order by r.created_at desc limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) r;
$alr$;

create or replace function public.api_respond_review(p_company_id uuid, p_review_id uuid, p_response text)
returns void language plpgsql security definer set search_path to 'public' as $arr$
declare v_resp text;
begin
  if not exists (
    select 1 from public.review r join public.location l on l.id = r.location_id
    where r.id = p_review_id and l.company_id = p_company_id) then
    raise exception 'Avaliação não encontrada nesta empresa.' using errcode = 'P0001'; end if;
  v_resp := nullif(trim(coalesce(p_response, '')), '');
  update public.review set owner_response = v_resp,
    owner_response_at = case when v_resp is null then null else now() end
  where id = p_review_id;
end; $arr$;

-- ════════════════════════════════════════════════════════════════════════════
-- OCUPAÇÃO
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_location_occupancy(p_company_id uuid, p_location_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $alo$
begin
  if not exists (select 1 from public.location where id = p_location_id and company_id = p_company_id and deleted_at is null) then
    raise exception 'Unidade não encontrada nesta empresa.' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'location_parking_type_id', lpt.id, 'parking_type', pt.name, 'date', d.date::date,
      'capacity', lpt.capacity, 'booked_count', coalesce(a.booked_count, 0))
      order by pt.name, d.date)
    from public.location_parking_type lpt
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    cross join generate_series(p_from, p_to, '1 day') d(date)
    left join public.location_parking_availability a on a.location_parking_type_id = lpt.id and a.date = d.date::date
    where lpt.location_id = p_location_id and lpt.is_active
  ), '[]'::jsonb);
end; $alo$;

-- ════════════════════════════════════════════════════════════════════════════
-- ESCRITAS — unidade e tipo de vaga (PATCH; null = mantém)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_update_location(
  p_company_id uuid, p_location_id uuid, p_name text default null, p_address text default null,
  p_phone text default null, p_email text default null, p_reservation_policy text default null,
  p_has_notice boolean default null, p_notice text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $aul$
declare v jsonb;
begin
  update public.location set
    name = coalesce(p_name, name), address = coalesce(p_address, address),
    phone = coalesce(p_phone, phone), email = coalesce(p_email, email),
    reservation_policy = coalesce(p_reservation_policy, reservation_policy),
    has_notice = coalesce(p_has_notice, has_notice), notice = coalesce(p_notice, notice)
  where id = p_location_id and company_id = p_company_id and deleted_at is null
  returning jsonb_build_object('id', id, 'name', name, 'address', address, 'phone', phone,
    'email', email, 'reservation_policy', reservation_policy, 'has_notice', has_notice, 'notice', notice) into v;
  if v is null then raise exception 'Unidade não encontrada nesta empresa.' using errcode = 'P0001'; end if;
  return v;
end; $aul$;

create or replace function public.api_update_parking_type(
  p_company_id uuid, p_location_parking_type_id uuid, p_is_active boolean default null,
  p_capacity integer default null, p_near_capacity_threshold integer default null,
  p_near_capacity_message text default null, p_has_minimum_stay boolean default null,
  p_minimum_stay_value integer default null, p_minimum_stay_unit text default null,
  p_has_minimum_date boolean default null, p_minimum_date date default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $aupt$
declare v jsonb;
begin
  if not exists (
    select 1 from public.location_parking_type lpt join public.location l on l.id = lpt.location_id
    where lpt.id = p_location_parking_type_id and l.company_id = p_company_id and l.deleted_at is null) then
    raise exception 'Tipo de vaga não encontrado nesta empresa.' using errcode = 'P0001'; end if;
  update public.location_parking_type set
    is_active = coalesce(p_is_active, is_active), capacity = coalesce(p_capacity, capacity),
    near_capacity_threshold = coalesce(p_near_capacity_threshold, near_capacity_threshold),
    near_capacity_message = coalesce(p_near_capacity_message, near_capacity_message),
    has_minimum_stay = coalesce(p_has_minimum_stay, has_minimum_stay),
    minimum_stay_value = coalesce(p_minimum_stay_value, minimum_stay_value),
    minimum_stay_unit = coalesce(p_minimum_stay_unit::public.minimum_stay_unit, minimum_stay_unit),
    has_minimum_date = coalesce(p_has_minimum_date, has_minimum_date),
    minimum_date = coalesce(p_minimum_date, minimum_date)
  where id = p_location_parking_type_id
  returning jsonb_build_object('id', id, 'is_active', is_active, 'capacity', capacity,
    'near_capacity_threshold', near_capacity_threshold, 'has_minimum_stay', has_minimum_stay,
    'minimum_stay_value', minimum_stay_value, 'has_minimum_date', has_minimum_date, 'minimum_date', minimum_date) into v;
  return v;
end; $aupt$;

-- ── Grants (service_role; chamadas pelo gateway/MCP) ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'api_list_coupons(uuid)', 'api_upsert_coupon(uuid, uuid, text, text, text, numeric, timestamptz, timestamptz, integer, boolean, integer, integer, numeric, integer, uuid[])',
    'api_set_coupon_active(uuid, uuid, boolean)', 'api_delete_coupon(uuid, uuid)',
    'api_list_discounts(uuid)', 'api_upsert_discount(uuid, uuid, uuid, text, text, text, numeric, timestamptz, timestamptz, integer, numeric, integer, boolean, integer, boolean, integer, uuid[])',
    'api_set_discount_active(uuid, uuid, boolean)', 'api_delete_discount(uuid, uuid)',
    'api_list_addons(uuid)', 'api_upsert_addon(uuid, uuid, text, text, text, numeric, boolean, integer)',
    'api_set_location_addon(uuid, uuid, uuid, boolean, numeric)', 'api_delete_addon(uuid, uuid)',
    'api_list_reviews(uuid, integer)', 'api_respond_review(uuid, uuid, text)',
    'api_location_occupancy(uuid, uuid, date, date)',
    'api_update_location(uuid, uuid, text, text, text, text, text, boolean, text)',
    'api_update_parking_type(uuid, uuid, boolean, integer, integer, text, boolean, integer, text, boolean, date)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant all on function public.%s to service_role', f);
  end loop;
end $$;
