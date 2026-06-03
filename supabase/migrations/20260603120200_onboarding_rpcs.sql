-- Partner Onboarding — RPCs (SECURITY DEFINER, padrão create_booking_atomic)
-- Centralizam as escritas multi-tabela do fluxo: operadores não têm INSERT direto
-- em company/location/company_parking_type/.../pricing_rule — tudo passa por aqui.

-- ───────────────────────────────────────── helpers de slug ─────────────────────────────────────────

create or replace function public.slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(
      lower(translate(coalesce(p_text, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn')),
      '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'));
$$;

create or replace function public.generate_unique_company_slug(p_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  base text := nullif(public.slugify(p_name), '');
  candidate text;
  n int := 1;
begin
  base := coalesce(base, 'parceiro');
  candidate := base;
  while exists (select 1 from public.company where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

create or replace function public.generate_unique_location_slug(p_company_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  base text := nullif(public.slugify(p_name), '');
  candidate text;
  n int := 1;
begin
  base := coalesce(base, 'unidade');
  candidate := base;
  while exists (select 1 from public.location where company_id = p_company_id and slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- ───────────────────────────────────── Stage 1: captura de lead ─────────────────────────────────────
-- Chamada pela Edge Function submit-partner-lead (service_role). Atômica.

create or replace function public.submit_partner_lead(
  p_company_name    text,
  p_contact_name    text,
  p_contact_email   text,
  p_contact_phone   text,
  p_tax_id          text default null,
  p_contact_role    text default null,
  p_city            text default null,
  p_state           text default null,
  p_estimated_spots integer default null,
  p_message         text default null,
  p_utm_source      text default null,
  p_utm_medium      text default null,
  p_utm_campaign    text default null,
  p_referrer        text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
begin
  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Nome da empresa é obrigatório.' using errcode = 'P0001';
  end if;

  insert into public.company (name, slug, tax_id, status, onboarding_status)
  values (
    trim(p_company_name),
    public.generate_unique_company_slug(p_company_name),
    nullif(trim(coalesce(p_tax_id, '')), ''),
    'inactive',
    'pending_review'
  )
  returning id into v_company_id;

  insert into public.company_onboarding (
    company_id, contact_name, contact_email, contact_phone, contact_role,
    city, state, estimated_spots, message,
    utm_source, utm_medium, utm_campaign, referrer
  )
  values (
    v_company_id, trim(p_contact_name), lower(trim(p_contact_email)), trim(p_contact_phone), p_contact_role,
    p_city, p_state, p_estimated_spots, p_message,
    p_utm_source, p_utm_medium, p_utm_campaign, p_referrer
  );

  return v_company_id;
end;
$$;

-- ─────────────────────────────────── guard de edição do wizard ───────────────────────────────────

create or replace function public.onboarding_assert_editable(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para editar este cadastro.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.company
    where id = p_company_id and onboarding_status in ('approved', 'in_progress')
  ) then
    raise exception 'Este cadastro não está em fase de edição.' using errcode = 'P0001';
  end if;

  -- ao primeiro save, passa de 'approved' para 'in_progress'
  update public.company
    set onboarding_status = 'in_progress'
    where id = p_company_id and onboarding_status = 'approved';
end;
$$;

create or replace function public.onboarding_bump_step(p_company_id uuid, p_step integer)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.company_onboarding
    set current_step = greatest(current_step, p_step)
    where company_id = p_company_id;
$$;

-- ─────────────────────────────────────── Step 1 — empresa ───────────────────────────────────────

create or replace function public.onboarding_update_company(
  p_company_id uuid,
  p_name       text,
  p_legal_name text default null,
  p_tax_id     text default null,
  p_logo_url   text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.onboarding_assert_editable(p_company_id);

  update public.company set
    name       = coalesce(nullif(trim(p_name), ''), name),
    legal_name = nullif(trim(coalesce(p_legal_name, '')), ''),
    tax_id     = nullif(trim(coalesce(p_tax_id, '')), ''),
    logo_url   = coalesce(p_logo_url, logo_url)
  where id = p_company_id;

  perform public.onboarding_bump_step(p_company_id, 1);
end;
$$;

-- ───────────────────────────────────── Step 2 — localização ─────────────────────────────────────

create or replace function public.onboarding_upsert_location(
  p_company_id        uuid,
  p_location_id       uuid,
  p_name              text,
  p_address           text default null,
  p_latitude          numeric default null,
  p_longitude         numeric default null,
  p_timezone          text default 'America/Sao_Paulo',
  p_phone             text default null,
  p_email             text default null,
  p_reservation_policy text default null,
  p_photos            jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_location_id uuid := p_location_id;
begin
  perform public.onboarding_assert_editable(p_company_id);

  if v_location_id is null then
    insert into public.location (
      company_id, name, slug, address, latitude, longitude, timezone,
      status, phone, email, reservation_policy, photos
    )
    values (
      p_company_id, trim(p_name),
      public.generate_unique_location_slug(p_company_id, p_name),
      p_address, p_latitude, p_longitude, coalesce(nullif(trim(coalesce(p_timezone,'')),''), 'America/Sao_Paulo'),
      'inactive', p_phone, p_email, p_reservation_policy, coalesce(p_photos, '[]'::jsonb)
    )
    returning id into v_location_id;
  else
    update public.location set
      name               = coalesce(nullif(trim(p_name), ''), name),
      address            = p_address,
      latitude           = p_latitude,
      longitude          = p_longitude,
      timezone           = coalesce(nullif(trim(coalesce(p_timezone,'')),''), timezone),
      phone              = p_phone,
      email              = p_email,
      reservation_policy = p_reservation_policy,
      photos             = coalesce(p_photos, photos)
    where id = v_location_id and company_id = p_company_id;

    if not found then
      raise exception 'Localização não encontrada para esta empresa.' using errcode = 'P0001';
    end if;
  end if;

  perform public.onboarding_bump_step(p_company_id, 2);
  return v_location_id;
end;
$$;

-- ──────────────────────────────────── Step 3 — tipos de vaga ────────────────────────────────────
-- p_items: jsonb array de { parking_type_id, base_price, capacity }

create or replace function public.onboarding_set_parking_types(
  p_company_id  uuid,
  p_location_id uuid,
  p_items       jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rec jsonb;
  v_cpt_id uuid;
begin
  perform public.onboarding_assert_editable(p_company_id);

  if not exists (select 1 from public.location where id = p_location_id and company_id = p_company_id) then
    raise exception 'Localização não pertence a esta empresa.' using errcode = 'P0001';
  end if;

  for rec in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity, is_active)
    values (
      p_company_id,
      (rec->>'parking_type_id')::uuid,
      coalesce((rec->>'base_price')::numeric, 0),
      coalesce((rec->>'capacity')::integer, 0),
      false
    )
    on conflict (company_id, parking_type_id) do update set
      base_price       = excluded.base_price,
      default_capacity = excluded.default_capacity
    returning id into v_cpt_id;

    insert into public.location_parking_type (location_id, company_parking_type_id, capacity, is_active)
    values (p_location_id, v_cpt_id, coalesce((rec->>'capacity')::integer, 0), false)
    on conflict (location_id, company_parking_type_id) do update set
      capacity = excluded.capacity;
  end loop;

  perform public.onboarding_bump_step(p_company_id, 3);
end;
$$;

-- ───────────────────────────────────── Step 4 — precificação ─────────────────────────────────────
-- p_strategy: 'uniform_by_duration' (preço por dia) | 'fixed_bracket' (valor fixo por faixa)
-- p_tiers: jsonb array de { from_day, to_day, unit_price, total_price }

create or replace function public.onboarding_set_pricing(
  p_company_id              uuid,
  p_location_parking_type_id uuid,
  p_strategy                text,
  p_tiers                   jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rec jsonb;
  v_rule_id uuid;
begin
  perform public.onboarding_assert_editable(p_company_id);

  if p_strategy not in ('uniform_by_duration', 'fixed_bracket') then
    raise exception 'Estratégia de preço inválida: %', p_strategy using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    where lpt.id = p_location_parking_type_id and l.company_id = p_company_id
  ) then
    raise exception 'Tipo de vaga não pertence a esta empresa.' using errcode = 'P0001';
  end if;

  insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy, old_price_strategy)
  values (p_location_parking_type_id, p_strategy, 'any_extra', 'none')
  on conflict (location_parking_type_id) do update set strategy = excluded.strategy
  returning id into v_rule_id;

  delete from public.pricing_tier where pricing_rule_id = v_rule_id and is_old_price = false;

  for rec in select value from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
    values (
      v_rule_id,
      coalesce((rec->>'from_day')::integer, 1),
      (rec->>'to_day')::integer,
      (rec->>'unit_price')::numeric,
      (rec->>'total_price')::numeric,
      false
    );
  end loop;

  perform public.onboarding_bump_step(p_company_id, 4);
end;
$$;

-- ────────────────────────────────── Step 5 — serviços adicionais ──────────────────────────────────
-- p_items: jsonb array de { code, name, base_price }

create or replace function public.onboarding_set_addons(
  p_company_id  uuid,
  p_location_id uuid,
  p_items       jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rec jsonb;
  v_addon_id uuid;
begin
  perform public.onboarding_assert_editable(p_company_id);

  if not exists (select 1 from public.location where id = p_location_id and company_id = p_company_id) then
    raise exception 'Localização não pertence a esta empresa.' using errcode = 'P0001';
  end if;

  for rec in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.add_on_service (company_id, code, name, base_price, is_active)
    values (
      p_company_id,
      public.slugify(coalesce(nullif(rec->>'code',''), rec->>'name')),
      trim(rec->>'name'),
      coalesce((rec->>'base_price')::numeric, 0),
      false
    )
    on conflict (company_id, code) do update set
      name       = excluded.name,
      base_price = excluded.base_price
    returning id into v_addon_id;

    insert into public.location_add_on_service (location_id, add_on_service_id, is_active)
    values (p_location_id, v_addon_id, false)
    on conflict (location_id, add_on_service_id) do nothing;
  end loop;

  perform public.onboarding_bump_step(p_company_id, 5);
end;
$$;

-- ────────────────────────────── Step 6 — enviar + go-live automático ──────────────────────────────

create or replace function public.onboarding_submit(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.onboarding_assert_editable(p_company_id);

  if not exists (
    select 1
    from public.location l
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
    where l.company_id = p_company_id and lpt.capacity > 0
  ) then
    raise exception 'Cadastre ao menos um tipo de vaga com capacidade e preço antes de enviar.' using errcode = 'P0001';
  end if;

  -- go-live automático: publica empresa, unidades, tipos de vaga
  update public.company set status = 'active', onboarding_status = 'active' where id = p_company_id;
  update public.location set status = 'active' where company_id = p_company_id;
  update public.company_parking_type set is_active = true where company_id = p_company_id;
  update public.location_parking_type lpt set is_active = true
    from public.location l
    where lpt.location_id = l.id and l.company_id = p_company_id;
  update public.location_add_on_service las set is_active = true
    from public.location l
    where las.location_id = l.id and l.company_id = p_company_id;
  update public.add_on_service set is_active = true where company_id = p_company_id;

  update public.company_onboarding set
    setup_submitted_at = now(),
    went_live_at = now(),
    current_step = 6
  where company_id = p_company_id;
end;
$$;

-- ───────────────────────────────────────── grants ─────────────────────────────────────────
-- captura de lead: só service_role (Edge Function). Nunca anon/authenticated direto.
revoke execute on function public.submit_partner_lead(text,text,text,text,text,text,text,text,integer,text,text,text,text,text) from public, anon, authenticated;

-- helpers internos: fora do alcance de anon
revoke execute on function public.generate_unique_company_slug(text) from anon;
revoke execute on function public.generate_unique_location_slug(uuid, text) from anon;
revoke execute on function public.onboarding_assert_editable(uuid) from anon;
revoke execute on function public.onboarding_bump_step(uuid, integer) from anon;

-- RPCs do wizard: authenticated (o guard restringe ao dono); bloqueia anon
revoke execute on function public.onboarding_update_company(uuid,text,text,text,text) from anon;
revoke execute on function public.onboarding_upsert_location(uuid,uuid,text,text,numeric,numeric,text,text,text,text,jsonb) from anon;
revoke execute on function public.onboarding_set_parking_types(uuid,uuid,jsonb) from anon;
revoke execute on function public.onboarding_set_pricing(uuid,uuid,text,jsonb) from anon;
revoke execute on function public.onboarding_set_addons(uuid,uuid,jsonb) from anon;
revoke execute on function public.onboarding_submit(uuid) from anon;
