-- Serviços adicionais: gestão pelo operator (fora do onboarding).
-- Adiciona sort_order e RPCs SECURITY DEFINER para o operator gerenciar o
-- catálogo da empresa (add_on_service) e a disponibilidade/preço por unidade
-- (location_add_on_service). Escrita continua sem RLS direta — só via estas RPCs.
-- Obs.: dollar-quotes nomeados ($fa$/$fu$/$fs$/$fd$) — o aplicador de migration
-- não lida bem com múltiplos blocos $$ anônimos.

-- 1) Ordenação estável no painel e no site -----------------------------------
alter table public.add_on_service
  add column if not exists sort_order integer not null default 0;

create index if not exists add_on_service_company_sort_idx
  on public.add_on_service (company_id, sort_order);

-- 2) Guard de escopo: hub_admin ou membro da empresa -------------------------
create or replace function public.addon_assert_company_access(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fa$
begin
  if public.is_hub_admin() then return; end if;
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para gerenciar serviços desta empresa.'
      using errcode = '42501';
  end if;
end; $fa$;

-- 3) Upsert do catálogo (add_on_service) -------------------------------------
create or replace function public.operator_upsert_addon(
  p_company_id uuid,
  p_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_base_price numeric,
  p_is_active boolean,
  p_sort_order integer
) returns uuid language plpgsql security definer set search_path to 'public' as $fu$
declare v_id uuid;
begin
  perform public.addon_assert_company_access(p_company_id);
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome do serviço é obrigatório.' using errcode = 'P0001';
  end if;

  if p_id is not null then
    update public.add_on_service set
      name        = trim(p_name),
      description  = nullif(trim(coalesce(p_description, '')), ''),
      base_price   = coalesce(p_base_price, 0),
      is_active    = coalesce(p_is_active, true),
      sort_order   = coalesce(p_sort_order, 0),
      code         = coalesce(nullif(trim(coalesce(p_code, '')), ''), code)
    where id = p_id and company_id = p_company_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Serviço não encontrado nesta empresa.' using errcode = 'P0001';
    end if;
  else
    insert into public.add_on_service
      (company_id, code, name, description, base_price, is_active, sort_order)
    values (
      p_company_id,
      public.slugify(coalesce(nullif(trim(coalesce(p_code, '')), ''), p_name)),
      trim(p_name),
      nullif(trim(coalesce(p_description, '')), ''),
      coalesce(p_base_price, 0),
      coalesce(p_is_active, true),
      coalesce(p_sort_order, 0)
    )
    on conflict (company_id, code) do update set
      name        = excluded.name,
      description  = excluded.description,
      base_price   = excluded.base_price,
      is_active    = excluded.is_active,
      sort_order   = excluded.sort_order
    returning id into v_id;
  end if;

  return v_id;
end; $fu$;

-- 4) Disponibilidade + preço por unidade (location_add_on_service) ------------
create or replace function public.operator_set_location_addon(
  p_add_on_service_id uuid,
  p_location_id uuid,
  p_is_active boolean,
  p_price_override numeric
) returns void language plpgsql security definer set search_path to 'public' as $fs$
declare v_company_id uuid;
begin
  select company_id into v_company_id
    from public.add_on_service where id = p_add_on_service_id;
  if v_company_id is null then
    raise exception 'Serviço não encontrado.' using errcode = 'P0001';
  end if;
  perform public.addon_assert_company_access(v_company_id);

  if not exists (
    select 1 from public.location
    where id = p_location_id and company_id = v_company_id and deleted_at is null
  ) then
    raise exception 'Unidade não pertence a esta empresa.' using errcode = 'P0001';
  end if;

  insert into public.location_add_on_service
    (location_id, add_on_service_id, is_active, price_override)
  values (p_location_id, p_add_on_service_id, coalesce(p_is_active, false), p_price_override)
  on conflict (location_id, add_on_service_id) do update set
    is_active      = excluded.is_active,
    price_override = excluded.price_override;
end; $fs$;

-- 5) Exclusão (bloqueia se já usado em reserva) ------------------------------
create or replace function public.operator_delete_addon(p_add_on_service_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fd$
declare v_company_id uuid;
begin
  select company_id into v_company_id
    from public.add_on_service where id = p_add_on_service_id;
  if v_company_id is null then
    raise exception 'Serviço não encontrado.' using errcode = 'P0001';
  end if;
  perform public.addon_assert_company_access(v_company_id);

  if exists (
    select 1 from public.booking_item where add_on_service_id = p_add_on_service_id
  ) then
    raise exception 'Serviço já usado em reservas; desative-o em vez de excluir.'
      using errcode = 'P0001';
  end if;

  -- location_add_on_service tem FK ON DELETE CASCADE
  delete from public.add_on_service where id = p_add_on_service_id;
end; $fd$;

-- 6) Grants (mesmo padrão dos onboarding_*) ----------------------------------
revoke all on function public.addon_assert_company_access(uuid) from public;
grant all on function public.addon_assert_company_access(uuid) to authenticated, service_role;

revoke all on function public.operator_upsert_addon(uuid, uuid, text, text, text, numeric, boolean, integer) from public;
grant all on function public.operator_upsert_addon(uuid, uuid, text, text, text, numeric, boolean, integer) to authenticated, service_role;

revoke all on function public.operator_set_location_addon(uuid, uuid, boolean, numeric) from public;
grant all on function public.operator_set_location_addon(uuid, uuid, boolean, numeric) to authenticated, service_role;

revoke all on function public.operator_delete_addon(uuid) from public;
grant all on function public.operator_delete_addon(uuid) to authenticated, service_role;
