-- Permissões por escopo (ADR-005) — passo C: gating server-authoritative.
-- Cada escrita do operador passa a exigir o ESCOPO correspondente (member_has_scope), além da
-- checagem de associação à empresa que já existia. hub_admin e dono → todos os escopos (helper).
-- Estratégia de baixo risco: cupons/descontos/serviços/chaves funilam por um *_assert_company_access
-- (1 função por domínio) — basta embutir o escopo lá. Os RPCs com checagem inline (preço, ocupação,
-- avaliações, financeiro, equipe) são recriados verbatim + 1 linha de guarda. As escritas diretas de
-- unidade/tipo de vaga (via RLS) ganham o escopo na policy de UPDATE.
-- Depende da migration B (member_has_scope + presets).

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Helpers de escrita por domínio (chokepoint) — embute o escopo de escrita
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.coupon_assert_company_access(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fa$
begin
  if public.is_hub_admin() then return; end if;
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para gerenciar cupons desta empresa.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'coupons:write') then
    raise exception 'Seu papel não permite gerir cupons (coupons:write).' using errcode = '42501';
  end if;
end; $fa$;

create or replace function public.discount_assert_company_access(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fa$
begin
  if public.is_hub_admin() then return; end if;
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para gerenciar descontos desta empresa.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'discounts:write') then
    raise exception 'Seu papel não permite gerir descontos (discounts:write).' using errcode = '42501';
  end if;
end; $fa$;

create or replace function public.addon_assert_company_access(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fa$
begin
  if public.is_hub_admin() then return; end if;
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para gerenciar serviços desta empresa.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'addons:write') then
    raise exception 'Seu papel não permite gerir serviços (addons:write).' using errcode = '42501';
  end if;
end; $fa$;

-- Gestão de chaves de API → api-keys:write (só Dono). Helper usado por todos os operator_*_api_key.
create or replace function public.api_key_assert_company_access(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $kassert$
begin
  if public.is_hub_admin() then return; end if;
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para gerenciar chaves desta empresa.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'api-keys:write') then
    raise exception 'Seu papel não permite gerir chaves de API (api-keys:write).' using errcode = '42501';
  end if;
end; $kassert$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) RPCs com checagem inline — recriados verbatim + guarda de escopo
-- ════════════════════════════════════════════════════════════════════════════

-- E1.4.1 · operator_set_pricing → pricing:write
create or replace function public.operator_set_pricing(
  p_location_parking_type_id uuid,
  p_base_price numeric,
  p_rule jsonb,
  p_tiers jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $sp$
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
  if not public.is_hub_admin() and v_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão para editar este preço.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'pricing:write') then
    raise exception 'Seu papel não permite editar preços (pricing:write).' using errcode = '42501';
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
end;
$sp$;

-- E1.4.2 · operator_set_date_blocked → pricing:write
create or replace function public.operator_set_date_blocked(
  p_location_parking_type_id uuid,
  p_date date,
  p_blocked boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $sdb$
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
    raise exception 'Sem permissão para bloquear datas desta unidade.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'pricing:write') then
    raise exception 'Seu papel não permite bloquear datas (pricing:write).' using errcode = '42501';
  end if;

  insert into public.location_parking_availability (location_parking_type_id, date, booked_count, blocked)
  values (p_location_parking_type_id, p_date, 0, p_blocked)
  on conflict (location_parking_type_id, date) do update set blocked = excluded.blocked;
end;
$sdb$;

-- E1.4.2 · operator_location_occupancy → occupancy:read
create or replace function public.operator_location_occupancy(
  p_location_id uuid,
  p_from date,
  p_to date
) returns table(
  location_parking_type_id uuid,
  parking_type_name text,
  date date,
  capacity integer,
  booked_count integer,
  blocked boolean
) language plpgsql stable security definer set search_path to 'public' as $occ$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.location where id = p_location_id and deleted_at is null;
  if v_company_id is null then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin()
     and not exists (select 1 from public.profile_company where profile_id = auth.uid() and company_id = v_company_id) then
    raise exception 'Sem permissão para ver a ocupação desta unidade.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'occupancy:read') then
    raise exception 'Seu papel não permite ver a ocupação (occupancy:read).' using errcode = '42501';
  end if;

  return query
    select lpt.id, pt.name, d.date::date, lpt.capacity, coalesce(a.booked_count, 0), coalesce(a.blocked, false)
    from public.location_parking_type lpt
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    cross join generate_series(p_from, p_to, '1 day') d(date)
    left join public.location_parking_availability a
      on a.location_parking_type_id = lpt.id and a.date = d.date::date
    where lpt.location_id = p_location_id and lpt.is_active
    order by pt.name, d.date;
end; $occ$;

-- Reviews · operator_respond_review → reviews:write
create or replace function public.operator_respond_review(p_review_id uuid, p_response text)
returns void language plpgsql security definer set search_path to 'public' as $rev$
declare v_company_id uuid; v_resp text;
begin
  select l.company_id into v_company_id
  from public.review r join public.location l on l.id = r.location_id
  where r.id = p_review_id;
  if v_company_id is null then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0001';
  end if;
  if not public.is_hub_admin() and not exists (
    select 1 from public.profile_company where profile_id = auth.uid() and company_id = v_company_id
  ) then
    raise exception 'Sem permissão para responder avaliações desta empresa.' using errcode = '42501';
  end if;
  if not public.member_has_scope(v_company_id, 'reviews:write') then
    raise exception 'Seu papel não permite responder avaliações (reviews:write).' using errcode = '42501';
  end if;
  v_resp := nullif(trim(coalesce(p_response, '')), '');
  update public.review set
    owner_response    = v_resp,
    owner_response_at = case when v_resp is null then null else now() end
  where id = p_review_id;
end; $rev$;

-- Financeiro · payout_statement → finance:read
create or replace function public.payout_statement(
  p_from          timestamptz,
  p_to            timestamptz,
  p_company_id    uuid default null,
  p_include_lines boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $pstmt$
declare
  v_is_admin boolean := public.is_hub_admin();
  v_result   jsonb;
begin
  if not v_is_admin then
    if p_company_id is null or p_company_id not in (select public.current_company_ids()) then
      raise exception 'Sem permissão para este extrato.' using errcode = '42501';
    end if;
    if not public.member_has_scope(p_company_id, 'finance:read') then
      raise exception 'Seu papel não permite ver o financeiro (finance:read).' using errcode = '42501';
    end if;
  end if;

  with legs as (
    select
      loc.company_id,
      c.name as company_name,
      p.status::text as status,
      b.code as booking_code,
      coalesce(p.paid_at, p.refunded_at) as event_at,
      coalesce(sum((r->>'amount')::int) filter (where (r->>'liable')::boolean is true), 0)  as partner_cents,
      coalesce(sum((r->>'amount')::int) filter (where (r->>'liable')::boolean is false), 0) as movepark_cents
    from public.payment p
    join public.booking b   on b.id = p.booking_id
    join public.location loc on loc.id = b.location_id
    join public.company c    on c.id = loc.company_id
    left join lateral jsonb_array_elements(p.split) as r on true
    where p.provider = 'pagarme'
      and p.status in ('paid', 'refunded')
      and coalesce(p.paid_at, p.refunded_at) >= p_from
      and coalesce(p.paid_at, p.refunded_at) < p_to
      and (p_company_id is null or loc.company_id = p_company_id)
      and (v_is_admin or loc.company_id in (select public.current_company_ids()))
    group by loc.company_id, c.name, p.id, p.status, b.code, p.paid_at, p.refunded_at
  ),
  agg as (
    select
      company_id, company_name,
      coalesce(sum(partner_cents), 0)                                       as gross_partner_cents,
      coalesce(sum(partner_cents) filter (where status = 'refunded'), 0)    as refunded_partner_cents,
      coalesce(sum(partner_cents) filter (where status = 'paid'), 0)        as net_partner_cents,
      coalesce(sum(movepark_cents) filter (where status = 'paid'), 0)       as movepark_commission_cents,
      count(*) filter (where status = 'paid')                               as paid_count,
      count(*) filter (where status = 'refunded')                          as refunded_count
    from legs
    group by company_id, company_name
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'companies', coalesce(jsonb_agg(
      jsonb_build_object(
        'company_id', a.company_id,
        'company_name', a.company_name,
        'gross_partner_cents', a.gross_partner_cents,
        'refunded_partner_cents', a.refunded_partner_cents,
        'net_partner_cents', a.net_partner_cents,
        'movepark_commission_cents', a.movepark_commission_cents,
        'paid_count', a.paid_count,
        'refunded_count', a.refunded_count,
        'lines', case when p_include_lines then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'booking_code', l.booking_code,
            'event_at', l.event_at,
            'status', l.status,
            'partner_cents', l.partner_cents,
            'movepark_cents', l.movepark_cents
          ) order by l.event_at desc), '[]'::jsonb)
          from legs l where l.company_id = a.company_id
        ) else null end
      ) order by a.company_name
    ), '[]'::jsonb)
  ) into v_result
  from agg a;

  return v_result;
end;
$pstmt$;

-- Financeiro · payout_balance → payouts:read
create or replace function public.payout_balance(
  p_company_id uuid,
  p_provider   text default 'pagarme'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $pbal$
declare
  v_is_admin  boolean := public.is_hub_admin();
  v_net       bigint;
  v_withdrawn bigint;
begin
  if not v_is_admin and p_company_id not in (select public.current_company_ids()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not public.member_has_scope(p_company_id, 'payouts:read') then
    raise exception 'Seu papel não permite ver o saldo de repasses (payouts:read).' using errcode = '42501';
  end if;

  select coalesce(sum((r->>'amount')::int) filter (where (r->>'liable')::boolean is true), 0)
    into v_net
  from public.payment p
  join public.booking b   on b.id = p.booking_id
  join public.location loc on loc.id = b.location_id
  left join lateral jsonb_array_elements(p.split) as r on true
  where p.provider = p_provider
    and p.status = 'paid'
    and loc.company_id = p_company_id;

  select coalesce(sum(amount_cents), 0)
    into v_withdrawn
  from public.payout_withdrawal
  where company_id = p_company_id and provider = p_provider
    and status = 'paid' and deleted_at is null;

  return jsonb_build_object(
    'company_id', p_company_id,
    'net_partner_cents', v_net,
    'withdrawn_cents', v_withdrawn,
    'balance_cents', v_net - v_withdrawn
  );
end;
$pbal$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Gestão de membros (E1.6) → team:read / team:write + guarda de último dono multi-papel
-- ════════════════════════════════════════════════════════════════════════════
-- Listar membros → team:read (todos os presets têm).
create or replace function public.company_list_members(p_company_id uuid)
returns table (profile_id uuid, full_name text, email text, role public.company_role, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $clm$
begin
  if not public.member_has_scope(p_company_id, 'team:read') then
    raise exception 'Sem acesso a esta empresa.' using errcode = '42501';
  end if;
  return query
    select pc.profile_id, p.full_name, u.email::text, pc.role, pc.created_at
    from public.profile_company pc
    join public.profiles p on p.id = pc.profile_id
    left join auth.users u on u.id = pc.profile_id
    where pc.company_id = p_company_id
    order by pc.role, pc.created_at;
end; $clm$;

-- Alterar papel → team:write. Guarda de último dono agora cobre TODOS os não-owner.
create or replace function public.company_set_member_role(
  p_company_id uuid, p_profile_id uuid, p_role public.company_role
) returns void language plpgsql security definer set search_path to 'public' as $csmr$
declare v_owner_count integer;
begin
  if not public.member_has_scope(p_company_id, 'team:write') then
    raise exception 'Seu papel não permite gerir usuários (team:write).' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profile_company
                 where company_id = p_company_id and profile_id = p_profile_id) then
    raise exception 'Usuário não pertence a esta empresa.' using errcode = 'P0001';
  end if;
  -- Rebaixar o ÚLTIMO dono pra qualquer papel não-owner deixaria a empresa sem dono.
  if p_role <> 'owner' then
    select count(*) into v_owner_count from public.profile_company
      where company_id = p_company_id and role = 'owner';
    if v_owner_count <= 1 and exists (select 1 from public.profile_company
        where company_id = p_company_id and profile_id = p_profile_id and role = 'owner') then
      raise exception 'A empresa precisa de ao menos um dono.' using errcode = 'P0001';
    end if;
  end if;
  update public.profile_company set role = p_role
    where company_id = p_company_id and profile_id = p_profile_id;
end; $csmr$;

-- Remover membro → team:write (guarda de último dono inalterada).
create or replace function public.company_remove_member(
  p_company_id uuid, p_profile_id uuid
) returns void language plpgsql security definer set search_path to 'public' as $crm$
declare v_owner_count integer; v_is_owner boolean;
begin
  if not public.member_has_scope(p_company_id, 'team:write') then
    raise exception 'Seu papel não permite gerir usuários (team:write).' using errcode = '42501';
  end if;
  select (role = 'owner') into v_is_owner from public.profile_company
    where company_id = p_company_id and profile_id = p_profile_id;
  if v_is_owner is null then
    raise exception 'Usuário não pertence a esta empresa.' using errcode = 'P0001';
  end if;
  if v_is_owner then
    select count(*) into v_owner_count from public.profile_company
      where company_id = p_company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'A empresa precisa de ao menos um dono.' using errcode = 'P0001';
    end if;
  end if;
  delete from public.profile_company
    where company_id = p_company_id and profile_id = p_profile_id;
end; $crm$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Escritas diretas via RLS (unidade / tipo de vaga) → escopo na policy de UPDATE
-- ════════════════════════════════════════════════════════════════════════════
-- O front edita location/location_parking_type direto (sem RPC). member_has_scope é SECURITY
-- DEFINER → seguro dentro da policy (não recursa). Operação/Financeiro deixam de poder editar.
drop policy if exists "location_operator_update" on public.location;
create policy "location_operator_update" on public.location for update
  using (public.is_hub_admin() or public.member_has_scope(company_id, 'locations:write'));

drop policy if exists "lpt_operator_update" on public.location_parking_type;
create policy "lpt_operator_update" on public.location_parking_type for update
  using (
    public.is_hub_admin()
    or public.member_has_scope(
      (select l.company_id from public.location l where l.id = location_id),
      'parking-types:write'
    )
  );
