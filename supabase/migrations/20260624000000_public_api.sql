-- Public API (E0.7, Fase 1). Ver docs/specs/public-api.md.
-- Chaves de API por empresa (hash + prefixo, escopos), RPCs de gestão pelo operator,
-- verificação pelo gateway (Edge Function `api`), e superfície tenant-scoped (api_*).
-- Reserva por parceiro: núcleo extraído (_create_booking_core) reusado pelo consumer
-- (create_booking_atomic) e pela API (api_create_booking). Atribuída à empresa, sem JWT.
-- Obs.: dollar-quotes nomeados ($k*$/$a*$/$core$) — o aplicador faz split por $$ anônimo.

-- ════════════════════════════════════════════════════════════════════════════
-- A1) Catálogo de escopos (referência seedada) + tabela de chaves
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.api_scope (
  scope       text primary key,
  module      text not null,
  description text not null
);

insert into public.api_scope (scope, module, description) values
  ('locations:read',       'locations',     'Listar e ler unidades da empresa'),
  ('locations:write',      'locations',     'Editar dados de unidade'),
  ('parking-types:read',   'parking-types', 'Listar tipos de vaga e preços'),
  ('parking-types:write',  'parking-types', 'Editar preço/status/capacidade de tipo de vaga'),
  ('availability:read',    'availability',  'Consultar disponibilidade por período'),
  ('pricing:read',         'pricing',       'Simular preço de uma reserva'),
  ('bookings:read',        'bookings',      'Listar e ler reservas da empresa'),
  ('bookings:write',       'bookings',      'Criar reserva via API'),
  ('bookings:cancel',      'bookings',      'Cancelar reserva'),
  ('bookings:checkin',     'bookings',      'Registrar check-in/check-out'),
  ('coupons:read',         'coupons',       'Ler cupons e descontos'),
  ('coupons:write',        'coupons',       'Gerir cupons e descontos'),
  ('reviews:read',         'reviews',       'Ler avaliações'),
  ('reviews:write',        'reviews',       'Responder avaliações'),
  ('faq:read',             'faq',           'Ler FAQ'),
  ('webhooks:write',       'webhooks',      'Registrar/gerir webhooks de integração')
on conflict (scope) do update set module = excluded.module, description = excluded.description;

alter table public.api_scope enable row level security;
do $$ begin
  create policy api_scope_read on public.api_scope
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

create table if not exists public.api_key (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.company(id) on delete cascade,
  name         text not null,
  key_prefix   text not null unique,
  key_hash     text not null,
  environment  text not null check (environment in ('live','test')),
  scopes       text[] not null default '{}',
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists api_key_company_idx
  on public.api_key (company_id) where deleted_at is null;

drop trigger if exists api_key_set_updated_at on public.api_key;
create trigger api_key_set_updated_at before update on public.api_key
  for each row execute function public.set_updated_at();

-- RLS: apenas SELECT (gestão é via RPC SECURITY DEFINER). Sem INSERT/UPDATE/DELETE.
-- O front lê via operator_list_api_keys (sem key_hash), não direto na tabela; ainda
-- assim a policy de leitura é restrita à própria empresa por defesa em profundidade.
alter table public.api_key enable row level security;
do $$ begin
  create policy api_key_operator_select on public.api_key
    for select using (
      public.is_hub_admin() or company_id in (select public.current_company_ids())
    );
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- A2) Guard de escopo + RPCs de gestão (operator no browser)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_key_assert_company_access(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $kassert$
begin
  if public.is_hub_admin() then return; end if;
  if not exists (
    select 1 from public.profile_company
    where profile_id = auth.uid() and company_id = p_company_id
  ) then
    raise exception 'Sem permissão para gerenciar chaves desta empresa.'
      using errcode = '42501';
  end if;
end; $kassert$;

-- Valida que todo escopo pedido existe no catálogo; senão erro.
create or replace function public.api_assert_scopes(p_scopes text[])
returns void language plpgsql stable security definer set search_path to 'public' as $kscopecheck$
declare v_bad text;
begin
  if p_scopes is null then return; end if;
  select s into v_bad from unnest(p_scopes) s
  where s not in (select scope from public.api_scope) limit 1;
  if v_bad is not null then
    raise exception 'Escopo inválido: %', v_bad using errcode = 'P0001';
  end if;
end; $kscopecheck$;

-- Cria a chave; gera o segredo server-side e o devolve UMA vez (em claro).
create or replace function public.operator_create_api_key(
  p_company_id uuid,
  p_name text,
  p_environment text,
  p_scopes text[],
  p_expires_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $kcreate$
declare
  v_secret text; v_key text; v_prefix text; v_hash text; v_id uuid; v_name text;
begin
  perform public.api_key_assert_company_access(p_company_id);
  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'Nome da chave é obrigatório.' using errcode = 'P0001';
  end if;
  if coalesce(p_environment, '') not in ('live','test') then
    raise exception 'Ambiente inválido (use live ou test).' using errcode = 'P0001';
  end if;
  if p_scopes is null or array_length(p_scopes, 1) is null then
    raise exception 'Selecione ao menos um escopo.' using errcode = 'P0001';
  end if;
  perform public.api_assert_scopes(p_scopes);

  -- segredo url-safe a partir de 30 bytes aleatórios; '+/=' → '-_' e remove '='
  v_secret := translate(encode(extensions.gen_random_bytes(30), 'base64'), '+/=', '-_');
  v_key    := 'mp_' || p_environment || '_' || v_secret;
  v_prefix := left(v_key, 16);
  v_hash   := encode(extensions.digest(v_key::bytea, 'sha256'), 'hex');

  insert into public.api_key
    (company_id, name, key_prefix, key_hash, environment, scopes, expires_at, created_by)
  values
    (p_company_id, v_name, v_prefix, v_hash, p_environment, p_scopes, p_expires_at, auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'key', v_key, 'key_prefix', v_prefix);
end; $kcreate$;

-- Lista chaves da empresa SEM key_hash/segredo (campos seguros + status derivado).
create or replace function public.operator_list_api_keys(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $klist$
begin
  perform public.api_key_assert_company_access(p_company_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', k.id,
      'name', k.name,
      'key_prefix', k.key_prefix,
      'environment', k.environment,
      'scopes', k.scopes,
      'last_used_at', k.last_used_at,
      'expires_at', k.expires_at,
      'created_at', k.created_at,
      'status', case
        when k.revoked_at is not null then 'revoked'
        when k.expires_at is not null and k.expires_at < now() then 'expired'
        else 'active' end
    ) order by k.created_at desc)
    from public.api_key k
    where k.company_id = p_company_id and k.deleted_at is null
  ), '[]'::jsonb);
end; $klist$;

-- Rotação: revoga a antiga e cria uma nova com os mesmos escopos/ambiente.
create or replace function public.operator_rotate_api_key(p_api_key_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $krotate$
declare v_old public.api_key; v_new jsonb;
begin
  select * into v_old from public.api_key where id = p_api_key_id and deleted_at is null;
  if v_old.id is null then
    raise exception 'Chave não encontrada.' using errcode = 'P0001';
  end if;
  perform public.api_key_assert_company_access(v_old.company_id);
  v_new := public.operator_create_api_key(
    v_old.company_id, v_old.name || ' (rotacionada)', v_old.environment, v_old.scopes, v_old.expires_at);
  update public.api_key set revoked_at = now() where id = p_api_key_id;
  return v_new;
end; $krotate$;

create or replace function public.operator_revoke_api_key(p_api_key_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $krevoke$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.api_key where id = p_api_key_id and deleted_at is null;
  if v_company_id is null then
    raise exception 'Chave não encontrada.' using errcode = 'P0001';
  end if;
  perform public.api_key_assert_company_access(v_company_id);
  update public.api_key set revoked_at = now() where id = p_api_key_id;
end; $krevoke$;

create or replace function public.operator_update_api_key_scopes(
  p_api_key_id uuid, p_scopes text[]
) returns void language plpgsql security definer set search_path to 'public' as $kscopes$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.api_key where id = p_api_key_id and deleted_at is null;
  if v_company_id is null then
    raise exception 'Chave não encontrada.' using errcode = 'P0001';
  end if;
  perform public.api_key_assert_company_access(v_company_id);
  if p_scopes is null or array_length(p_scopes, 1) is null then
    raise exception 'Selecione ao menos um escopo.' using errcode = 'P0001';
  end if;
  perform public.api_assert_scopes(p_scopes);
  update public.api_key set scopes = p_scopes where id = p_api_key_id;
end; $kscopes$;

-- ════════════════════════════════════════════════════════════════════════════
-- A3) Verificação pelo gateway (service_role). Atualiza last_used_at.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_key_verify(p_key_prefix text, p_key_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $kverify$
declare k public.api_key;
begin
  select * into k from public.api_key
  where key_prefix = p_key_prefix and deleted_at is null limit 1;

  if k.id is null or k.key_hash <> p_key_hash then
    return jsonb_build_object('ok', false, 'reason', 'invalid_key');
  end if;
  if k.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if k.expires_at is not null and k.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  update public.api_key set last_used_at = now() where id = k.id;

  return jsonb_build_object(
    'ok', true,
    'api_key_id', k.id,
    'company_id', k.company_id,
    'environment', k.environment,
    'scopes', k.scopes
  );
end; $kverify$;

-- ════════════════════════════════════════════════════════════════════════════
-- A4) Superfície tenant-scoped (chamada pelo gateway com p_company_id)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_assert_lpt_company(p_company_id uuid, p_lpt_id uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $assertlpt$
begin
  if not exists (
    select 1 from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
    where lpt.id = p_lpt_id and l.company_id = p_company_id and l.deleted_at is null
  ) then
    raise exception 'Tipo de vaga não encontrado nesta empresa.' using errcode = 'P0001';
  end if;
end; $assertlpt$;

create or replace function public.api_list_locations(
  p_company_id uuid, p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $alloc$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'slug', l.slug, 'name', l.name, 'address', l.address,
      'latitude', l.latitude, 'longitude', l.longitude, 'timezone', l.timezone,
      'status', l.status, 'phone', l.phone, 'email', l.email
    ) order by l.name)
    from (
      select * from public.location
      where company_id = p_company_id and deleted_at is null
      order by name limit greatest(1, least(coalesce(p_limit, 20), 100)) offset greatest(0, coalesce(p_offset, 0))
    ) l
  ), '[]'::jsonb);
end; $alloc$;

create or replace function public.api_get_location(p_company_id uuid, p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $getloc$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', l.id, 'slug', l.slug, 'name', l.name, 'address', l.address,
    'latitude', l.latitude, 'longitude', l.longitude, 'timezone', l.timezone,
    'status', l.status, 'phone', l.phone, 'email', l.email, 'photos', l.photos
  ) into v
  from public.location l
  where l.id = p_location_id and l.company_id = p_company_id and l.deleted_at is null;
  if v is null then
    raise exception 'Unidade não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  return v;
end; $getloc$;

create or replace function public.api_list_parking_types(p_company_id uuid, p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $listpt$
begin
  if not exists (
    select 1 from public.location where id = p_location_id and company_id = p_company_id and deleted_at is null
  ) then
    raise exception 'Unidade não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lpt.id, 'code', pt.code, 'name', pt.name,
      'capacity', lpt.capacity, 'is_active', lpt.is_active
    ) order by pt.name)
    from public.location_parking_type lpt
    join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    join public.parking_type pt on pt.id = cpt.parking_type_id
    where lpt.location_id = p_location_id
  ), '[]'::jsonb);
end; $listpt$;

create or replace function public.api_list_bookings(
  p_company_id uuid,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $listbk$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'code', b.code, 'status', b.status,
      'location_id', b.location_id, 'check_in_at', b.check_in_at, 'check_out_at', b.check_out_at,
      'total_amount', b.total_amount, 'currency', b.currency,
      'customer_name', b.customer_name, 'customer_email', b.customer_email,
      'created_via_api', (b.created_via_api_key_id is not null),
      'created_at', b.created_at
    ) order by b.created_at desc)
    from (
      select b.* from public.booking b
      join public.location l on l.id = b.location_id
      where l.company_id = p_company_id and b.deleted_at is null
        and (p_status is null or b.status::text = p_status)
        and (p_from is null or b.check_in_at >= p_from)
        and (p_to is null or b.check_in_at <= p_to)
      order by b.created_at desc
      limit greatest(1, least(coalesce(p_limit, 20), 100)) offset greatest(0, coalesce(p_offset, 0))
    ) b
  ), '[]'::jsonb);
end; $listbk$;

create or replace function public.api_get_booking(p_company_id uuid, p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $getbk$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'status', b.status,
    'location_id', b.location_id, 'check_in_at', b.check_in_at, 'check_out_at', b.check_out_at,
    'total_amount', b.total_amount, 'currency', b.currency,
    'customer_name', b.customer_name, 'customer_email', b.customer_email, 'customer_phone', b.customer_phone,
    'created_via_api', (b.created_via_api_key_id is not null),
    'checked_in_at', b.checked_in_at, 'checked_out_at', b.checked_out_at,
    'created_at', b.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_type', bi.item_type, 'quantity', bi.quantity,
        'unit_price', bi.unit_price, 'subtotal', bi.subtotal))
      from public.booking_item bi where bi.booking_id = b.id), '[]'::jsonb)
  ) into v
  from public.booking b
  join public.location l on l.id = b.location_id
  where b.id = p_booking_id and l.company_id = p_company_id and b.deleted_at is null;
  if v is null then
    raise exception 'Reserva não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  return v;
end; $getbk$;

-- Simulação de preço tenant-scoped (resolve slugs do lpt da empresa e reusa simulate_price)
create or replace function public.api_simulate_price(
  p_company_id uuid, p_location_parking_type_id uuid, p_days integer
) returns jsonb language plpgsql stable security definer set search_path to 'public' as $asim$
declare v_company_slug text; v_location_slug text; v_parking_type_code text;
begin
  select c.slug, l.slug, pt.code
    into v_company_slug, v_location_slug, v_parking_type_code
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.id = p_location_parking_type_id and l.company_id = p_company_id and l.deleted_at is null;
  if v_company_slug is null then
    raise exception 'Tipo de vaga não encontrado nesta empresa.' using errcode = 'P0001';
  end if;
  return public.simulate_price(v_company_slug, v_location_slug, v_parking_type_code, greatest(1, coalesce(p_days, 1)));
end; $asim$;

-- ════════════════════════════════════════════════════════════════════════════
-- A5) Reserva por parceiro: schema + núcleo extraído + RPCs de escrita
-- ════════════════════════════════════════════════════════════════════════════
alter table public.booking alter column profile_id drop not null;
alter table public.booking
  add column if not exists customer_name          text,
  add column if not exists customer_email         text,
  add column if not exists customer_phone         text,
  add column if not exists created_via_api_key_id uuid references public.api_key(id) on delete set null,
  add column if not exists idempotency_key        text;

do $$ begin
  alter table public.booking add constraint booking_actor_check
    check (profile_id is not null or created_via_api_key_id is not null);
exception when duplicate_object then null; end $$;

-- idempotência por chave: 1 reserva por (api_key, idempotency_key)
create unique index if not exists booking_api_idempotency_idx
  on public.booking (created_via_api_key_id, idempotency_key)
  where idempotency_key is not null;

-- Núcleo da reserva: aceita consumer (profile_id) OU parceiro (api_key + contato).
-- Corpo idêntico ao create_booking_atomic autoritativo (capacity_real), só estende
-- o INSERT de booking com os campos de parceiro.
create or replace function public._create_booking_core(
  p_profile_id uuid,
  p_created_via_api_key_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_passenger_count integer,
  p_has_pcd boolean,
  p_vehicle_id uuid,
  p_add_on_ids uuid[],
  p_coupon_code text,
  p_origin text
) returns jsonb language plpgsql security definer set search_path to 'public' as $core$
declare
  v_lpt_id uuid; v_lpt_capacity int; v_lpt_active boolean;
  v_location_id uuid; v_location_slug text; v_company_slug text;
  v_parking_type_id uuid; v_parking_type_code text; v_cpt_id uuid;
  v_has_min_stay boolean; v_min_stay_value int; v_min_stay_unit public.minimum_stay_unit;
  v_has_min_date boolean; v_min_date date; v_advance_min int;
  v_days int; v_total_minutes int; v_date date; v_booked int;
  v_sim jsonb; v_price numeric; v_base numeric; v_old_price numeric; v_subtotal numeric;
  v_code text; v_booking_id uuid; v_expires_at timestamptz;
  v_add_on_id uuid; v_add_on_name text; v_add_on_price numeric;
  v_coupon_id uuid; v_discount numeric := 0; v_total numeric;
  v_line_items jsonb := '[]'::jsonb; v_eval record;
  v_auto_rule uuid; v_auto_discount numeric := 0; v_auto_stack boolean := true; v_disc record;
begin
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
  v_total := v_subtotal - v_discount;

  insert into public.booking (
    code, profile_id, location_id, vehicle_id, check_in_at, check_out_at,
    total_amount, currency, passenger_count, has_pcd, origin, status, expires_at,
    created_via_api_key_id, customer_name, customer_email, customer_phone
  ) values (
    v_code, p_profile_id, v_location_id, p_vehicle_id, p_check_in_at, p_check_out_at,
    v_total, 'BRL', p_passenger_count, p_has_pcd, p_origin, 'pending', v_expires_at,
    p_created_via_api_key_id, p_customer_name, p_customer_email, p_customer_phone
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
end; $core$;

-- create_booking_atomic vira wrapper fino (comportamento do consumer inalterado).
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
begin
  return public._create_booking_core(
    p_profile_id, null, null, null, null,
    p_location_parking_type_id, p_check_in_at, p_check_out_at,
    p_passenger_count, p_has_pcd, p_vehicle_id, p_add_on_ids, p_coupon_code, p_origin);
end; $cba$;

-- Reserva via API (atribuída à empresa). Idempotente por (api_key, idempotency_key).
create or replace function public.api_create_booking(
  p_company_id uuid,
  p_api_key_id uuid,
  p_location_parking_type_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_customer_name text default null,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_passenger_count integer default null,
  p_has_pcd boolean default false,
  p_add_on_ids uuid[] default null,
  p_coupon_code text default null,
  p_idempotency_key text default null,
  p_origin text default 'api'
) returns jsonb language plpgsql security definer set search_path to 'public' as $acb$
declare v_existing public.booking; v_res jsonb;
begin
  perform public.api_assert_lpt_company(p_company_id, p_location_parking_type_id);

  -- idempotência: mesma chave + mesmo idempotency_key → devolve a reserva existente
  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select * into v_existing from public.booking
    where created_via_api_key_id = p_api_key_id and idempotency_key = p_idempotency_key
    limit 1;
    if v_existing.id is not null then
      return jsonb_build_object('booking_id', v_existing.id, 'code', v_existing.code,
        'total_amount', v_existing.total_amount, 'status', v_existing.status, 'idempotent_replay', true);
    end if;
  end if;

  v_res := public._create_booking_core(
    null, p_api_key_id, p_customer_name, p_customer_email, p_customer_phone,
    p_location_parking_type_id, p_check_in_at, p_check_out_at,
    p_passenger_count, p_has_pcd, null, p_add_on_ids, p_coupon_code, p_origin);

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    update public.booking set idempotency_key = p_idempotency_key
    where id = (v_res ->> 'booking_id')::uuid;
  end if;

  return v_res;
end; $acb$;

create or replace function public.api_cancel_booking(
  p_company_id uuid, p_booking_id uuid, p_reason text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $acancel$
declare v_status public.booking_status;
begin
  select b.status into v_status from public.booking b
  join public.location l on l.id = b.location_id
  where b.id = p_booking_id and l.company_id = p_company_id and b.deleted_at is null;
  if v_status is null then
    raise exception 'Reserva não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  if v_status in ('cancelled','completed') then
    raise exception 'Reserva não pode ser cancelada no status atual.' using errcode = 'P0001';
  end if;
  perform public.release_booking_capacity(p_booking_id);
  update public.booking
     set status = 'cancelled', deleted_at = now(),
         notes = coalesce(notes || ' | ', '') || coalesce(nullif(trim(p_reason), ''), 'cancelada via API')
   where id = p_booking_id;
  return jsonb_build_object('booking_id', p_booking_id, 'status', 'cancelled');
end; $acancel$;

create or replace function public.api_checkin_booking(
  p_company_id uuid, p_booking_id uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $acheckin$
declare v_status public.booking_status;
begin
  select b.status into v_status from public.booking b
  join public.location l on l.id = b.location_id
  where b.id = p_booking_id and l.company_id = p_company_id and b.deleted_at is null;
  if v_status is null then
    raise exception 'Reserva não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Só reservas confirmadas podem fazer check-in.' using errcode = 'P0001';
  end if;
  update public.booking set status = 'checked_in', checked_in_at = now() where id = p_booking_id;
  return jsonb_build_object('booking_id', p_booking_id, 'status', 'checked_in');
end; $acheckin$;

create or replace function public.api_checkout_booking(
  p_company_id uuid, p_booking_id uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $acheckout$
declare v_status public.booking_status;
begin
  select b.status into v_status from public.booking b
  join public.location l on l.id = b.location_id
  where b.id = p_booking_id and l.company_id = p_company_id and b.deleted_at is null;
  if v_status is null then
    raise exception 'Reserva não encontrada nesta empresa.' using errcode = 'P0001';
  end if;
  if v_status <> 'checked_in' then
    raise exception 'Só reservas com check-in podem fazer check-out.' using errcode = 'P0001';
  end if;
  update public.booking set status = 'completed', checked_out_at = now() where id = p_booking_id;
  return jsonb_build_object('booking_id', p_booking_id, 'status', 'completed');
end; $acheckout$;

-- ════════════════════════════════════════════════════════════════════════════
-- Grants — gestão pelo operator (authenticated) + gateway (service_role).
-- As RPCs api_*/verify são SÓ service_role (não expostas ao browser).
-- ════════════════════════════════════════════════════════════════════════════
revoke all on function public.api_key_assert_company_access(uuid) from public;
grant all on function public.api_key_assert_company_access(uuid) to authenticated, service_role;

revoke all on function public.api_assert_scopes(text[]) from public;
grant all on function public.api_assert_scopes(text[]) to authenticated, service_role;

revoke all on function public.operator_create_api_key(uuid, text, text, text[], timestamptz) from public;
grant all on function public.operator_create_api_key(uuid, text, text, text[], timestamptz) to authenticated, service_role;

revoke all on function public.operator_list_api_keys(uuid) from public;
grant all on function public.operator_list_api_keys(uuid) to authenticated, service_role;

revoke all on function public.operator_rotate_api_key(uuid) from public;
grant all on function public.operator_rotate_api_key(uuid) to authenticated, service_role;

revoke all on function public.operator_revoke_api_key(uuid) from public;
grant all on function public.operator_revoke_api_key(uuid) to authenticated, service_role;

revoke all on function public.operator_update_api_key_scopes(uuid, text[]) from public;
grant all on function public.operator_update_api_key_scopes(uuid, text[]) to authenticated, service_role;

revoke all on function public.api_key_verify(text, text) from public;
grant all on function public.api_key_verify(text, text) to service_role;

revoke all on function public.api_assert_lpt_company(uuid, uuid) from public;
grant all on function public.api_assert_lpt_company(uuid, uuid) to service_role;

revoke all on function public.api_list_locations(uuid, integer, integer) from public;
grant all on function public.api_list_locations(uuid, integer, integer) to service_role;

revoke all on function public.api_get_location(uuid, uuid) from public;
grant all on function public.api_get_location(uuid, uuid) to service_role;

revoke all on function public.api_list_parking_types(uuid, uuid) from public;
grant all on function public.api_list_parking_types(uuid, uuid) to service_role;

revoke all on function public.api_list_bookings(uuid, text, timestamptz, timestamptz, integer, integer) from public;
grant all on function public.api_list_bookings(uuid, text, timestamptz, timestamptz, integer, integer) to service_role;

revoke all on function public.api_get_booking(uuid, uuid) from public;
grant all on function public.api_get_booking(uuid, uuid) to service_role;

revoke all on function public.api_simulate_price(uuid, uuid, integer) from public;
grant all on function public.api_simulate_price(uuid, uuid, integer) to service_role;

revoke all on function public._create_booking_core(uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text) from public;
grant all on function public._create_booking_core(uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text) to service_role;

revoke all on function public.create_booking_atomic(uuid, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text) from public;
grant all on function public.create_booking_atomic(uuid, uuid, timestamptz, timestamptz, integer, boolean, uuid, uuid[], text, text) to authenticated, service_role;

revoke all on function public.api_create_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, integer, boolean, uuid[], text, text, text) from public;
grant all on function public.api_create_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, integer, boolean, uuid[], text, text, text) to service_role;

revoke all on function public.api_cancel_booking(uuid, uuid, text) from public;
grant all on function public.api_cancel_booking(uuid, uuid, text) to service_role;

revoke all on function public.api_checkin_booking(uuid, uuid) from public;
grant all on function public.api_checkin_booking(uuid, uuid) to service_role;

revoke all on function public.api_checkout_booking(uuid, uuid) from public;
grant all on function public.api_checkout_booking(uuid, uuid) to service_role;
