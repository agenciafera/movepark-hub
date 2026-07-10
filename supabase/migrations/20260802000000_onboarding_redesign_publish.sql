-- E1.9 — Redesenho do onboarding do parceiro (fluxo "Publicar")
-- Spec: docs/specs/partner-onboarding-redesign.md
--
-- Fase 1:
--   1. location.has_shuttle (traslado sim/não no publicar)
--   2. onboarding_upsert_location estendida (p_destination_id, p_has_shuttle)
--   3. onboarding_publish: auto-semeia pricing_rule do balcão e ativa a unidade
--      (sem exigir o passo de preço do dono — Q-010: balcão é âncora, online é derivado)
--
-- Preview travado: NÃO precisa de RPC/RLS nova — as policies de SELECT scopeadas por empresa
-- (company_select, location_select, lpt_select, pricing_rule_select) já deixam o dono ler as
-- próprias entidades independente de is_active/status. Ver spec §6.4.

-- ── 1. Coluna has_shuttle ───────────────────────────────────────────────────
alter table public.location
  add column if not exists has_shuttle boolean not null default false;

comment on column public.location.has_shuttle is
  'Traslado sim/não declarado no onboarding "Publicar" (E1.9). Detalhes (frequência/minutos) em shuttle_*.';

-- ── 2. onboarding_upsert_location estendida ─────────────────────────────────
-- Assinatura muda (novos params opcionais no fim) → dropa a antiga p/ evitar overload ambíguo
-- no PostgREST. Chamadas atuais (Step2Location) seguem válidas via resolução por nome de arg.
drop function if exists public.onboarding_upsert_location(
  uuid, uuid, text, text, numeric, numeric, text, text, text, text, jsonb);

create function public.onboarding_upsert_location(
  p_company_id uuid,
  p_location_id uuid,
  p_name text,
  p_address text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_timezone text default 'America/Sao_Paulo',
  p_phone text default null,
  p_email text default null,
  p_reservation_policy text default null,
  p_photos jsonb default '[]'::jsonb,
  p_destination_id uuid default null,
  p_has_shuttle boolean default null
) returns uuid
  language plpgsql security definer
  set search_path to 'public'
as $$
declare v_location_id uuid := p_location_id;
begin
  perform public.onboarding_assert_editable(p_company_id);
  if v_location_id is null then
    insert into public.location (
      company_id, name, slug, address, latitude, longitude, timezone, status,
      phone, email, reservation_policy, photos, destination_id, has_shuttle)
    values (
      p_company_id, trim(p_name), public.generate_unique_location_slug(p_company_id, p_name),
      p_address, p_latitude, p_longitude, coalesce(nullif(trim(coalesce(p_timezone,'')),''), 'America/Sao_Paulo'),
      'inactive', p_phone, p_email, p_reservation_policy, coalesce(p_photos, '[]'::jsonb),
      p_destination_id, coalesce(p_has_shuttle, false))
    returning id into v_location_id;
  else
    update public.location set
      name = coalesce(nullif(trim(p_name), ''), name),
      address = p_address,
      latitude = p_latitude,
      longitude = p_longitude,
      timezone = coalesce(nullif(trim(coalesce(p_timezone,'')),''), timezone),
      phone = p_phone,
      email = p_email,
      reservation_policy = p_reservation_policy,
      photos = coalesce(p_photos, photos),
      destination_id = coalesce(p_destination_id, destination_id),
      has_shuttle = coalesce(p_has_shuttle, has_shuttle)
    where id = v_location_id and company_id = p_company_id;
    if not found then
      raise exception 'Localização não encontrada para esta empresa.' using errcode = 'P0001';
    end if;
  end if;
  perform public.onboarding_bump_step(p_company_id, 2);
  return v_location_id;
end; $$;

alter function public.onboarding_upsert_location(
  uuid, uuid, text, text, numeric, numeric, text, text, text, text, jsonb, uuid, boolean)
  owner to postgres;

-- Grants espelham o padrão das demais RPCs de onboarding (chamadas pelo operador autenticado).
-- Nota: o Supabase concede EXECUTE a `anon` por default privilege em funções novas no schema
-- public; revoke from public NÃO remove esse grant explícito. Revogar `anon` explicitamente para
-- não expor a escrita de onboarding ao público (E0.6 — evita regressão de mutação exposta a anon).
revoke all on function public.onboarding_upsert_location(
  uuid, uuid, text, text, numeric, numeric, text, text, text, text, jsonb, uuid, boolean) from public, anon;
grant execute on function public.onboarding_upsert_location(
  uuid, uuid, text, text, numeric, numeric, text, text, text, text, jsonb, uuid, boolean)
  to authenticated, service_role;

-- ── 3. onboarding_publish ────────────────────────────────────────────────────
-- Publica a unidade com o mínimo (Q-010): exige capacidade + balcão por tipo; auto-semeia a
-- pricing_rule (online = balcão como default uniform_by_duration) para cada tipo sem regra; ativa
-- empresa/location/tipos. Mesma transição de go-live do onboarding_submit, sem o passo de preço.
create or replace function public.onboarding_publish(p_company_id uuid)
  returns void
  language plpgsql security definer
  set search_path to 'public'
as $$
declare v_lpt record; v_rule_id uuid; v_base numeric;
begin
  perform public.onboarding_assert_editable(p_company_id);

  -- exige ≥ 1 tipo com capacidade > 0 e balcão (base_price) > 0
  if not exists (
    select 1
    from public.location l
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    where l.company_id = p_company_id and lpt.capacity > 0 and cpt.base_price > 0
  ) then
    raise exception 'Cadastre ao menos um tipo de vaga com capacidade e preço de balcão antes de publicar.'
      using errcode = 'P0001';
  end if;

  -- auto-semeia pricing_rule (online = balcão) para cada tipo com capacidade que ainda não tem regra
  for v_lpt in
    select lpt.id as lpt_id, cpt.base_price
    from public.location l
    join public.location_parking_type lpt on lpt.location_id = l.id
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    where l.company_id = p_company_id and lpt.capacity > 0 and cpt.base_price > 0
      and not exists (select 1 from public.pricing_rule pr where pr.location_parking_type_id = lpt.id)
  loop
    insert into public.pricing_rule (location_parking_type_id, strategy, fractional_day_policy, old_price_strategy)
    values (v_lpt.lpt_id, 'uniform_by_duration', 'any_extra', 'none')
    returning id into v_rule_id;
    insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
    values (v_rule_id, 1, null, v_lpt.base_price, null, false);
  end loop;

  -- ativa (go-live)
  update public.company set status = 'active', onboarding_status = 'active' where id = p_company_id;
  update public.location set status = 'active' where company_id = p_company_id;
  update public.company_parking_type set is_active = true where company_id = p_company_id;
  update public.location_parking_type lpt set is_active = true
    from public.location l
    where lpt.location_id = l.id and l.company_id = p_company_id and lpt.capacity > 0;
  update public.company_onboarding
    set setup_submitted_at = now(), went_live_at = now(), current_step = 6
    where company_id = p_company_id;
end; $$;

alter function public.onboarding_publish(uuid) owner to postgres;
revoke all on function public.onboarding_publish(uuid) from public, anon;
grant execute on function public.onboarding_publish(uuid) to authenticated, service_role;
