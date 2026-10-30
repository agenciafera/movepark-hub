-- Integrações com sistemas de terceiros, Fase 1 (motor, sem tela). Spec: docs/specs/integracoes.md
--
-- A integração com a cancela da Cloudpark vivia num workflow do n8n acionado só pelo site
-- (legado). Desde 01/10/2026 Nationpark e Abbapark vendem pelo Hub, e nenhuma reserva do Hub
-- chegava na Cloudpark (43 até 30/10). Esta migration traz o motor para o Hub:
--
--   integration_connection   uma instalação de provedor por unidade; token no Vault, nunca na linha
--   integration_delivery     fila de envio com nova tentativa e retenção do e-mail de confirmação
--   integration_attempt      rastro de cada chamada HTTP (sem token, com contato mascarado)
--   integration_access_code  código devolvido pelo provedor, que vira o QR do voucher
--
-- Escrita só por RPC com escopo (ADR-005): `integrations:write` é só do Dono (decisão D3 de
-- 30/10/2026). Leitura do parceiro também por RPC, que nunca devolve o segredo. As tabelas
-- ficam fechadas para o cliente; o service_role das Edges passa livre.
--
-- A fila nasce de um trigger em `booking` (status vira `confirmed`), como o
-- `wps_enqueue_booking_event`, para nenhum caminho de confirmação ficar de fora. O trigger nunca
-- derruba a confirmação: erro vira WARNING. A Edge `integration-deliver` (cron a cada minuto, só
-- quando há trabalho) processa a fila; a confirmação do pagamento tenta na hora, para o código
-- chegar antes do voucher.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Escopos (ADR-005)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.api_scope (scope, module, description, assignable_to_api_key) values
  ('integrations:read', 'integrations', 'Ver as integrações da empresa e os envios', false),
  ('integrations:write', 'integrations', 'Instalar e configurar integrações, inclusive credenciais', false)
on conflict (scope) do update set
  module = excluded.module,
  description = excluded.description,
  assignable_to_api_key = excluded.assignable_to_api_key;

insert into public.company_role_scope (role, scope) values
  ('owner', 'integrations:read'),
  ('manager', 'integrations:read'),
  ('operator', 'integrations:read'),
  ('owner', 'integrations:write')
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabelas
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.integration_connection (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.company(id) on delete cascade,
  location_id         uuid not null references public.location(id) on delete cascade,
  provider            text not null check (provider in ('cloudpark')),
  enabled             boolean not null default false,
  config              jsonb not null default '{}'::jsonb,
  secret_id           uuid,
  secret_hint         text,
  send_hub_bookings   boolean not null default true,
  send_site_bookings  boolean not null default false,
  last_test_at        timestamptz,
  last_test_ok        boolean,
  last_test_detail    text,
  auth_failed_at      timestamptz,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint integration_connection_enabled_requires_secret
    check (not enabled or secret_id is not null),
  -- Só o link de nuvem da Cloudpark: o Hub não alcança a rede local do pátio, e host livre
  -- abriria a Edge para mandar dado de cliente (e o token) para qualquer endereço.
  constraint integration_connection_cloudpark_url
    check (provider <> 'cloudpark' or coalesce(config->>'base_url', '') ~ '^https://[a-z0-9-]+\.cloudpark\.com\.br$')
);
comment on table public.integration_connection is
  'Instalação de um provedor de integração (ex.: Cloudpark) numa unidade. Token no Vault (secret_id). Spec: docs/specs/integracoes.md';

create unique index if not exists integration_connection_location_provider_uidx
  on public.integration_connection (location_id, provider) where deleted_at is null;
create index if not exists integration_connection_company_idx
  on public.integration_connection (company_id) where deleted_at is null;

create table if not exists public.integration_delivery (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.integration_connection(id) on delete cascade,
  company_id        uuid not null references public.company(id) on delete cascade,
  source            text not null check (source in ('hub', 'site')),
  booking_id        uuid references public.booking(id) on delete cascade,
  wl_order_id       bigint,
  operation         text not null default 'reserve' check (operation in ('reserve')),
  idempotency_key   text not null unique,
  payload           jsonb,
  status            text not null default 'pending'
                      check (status in ('pending', 'delivered', 'failed', 'cancelled')),
  attempts          integer not null default 0,
  max_attempts      integer not null default 28,
  next_attempt_at   timestamptz not null default now(),
  hold_until        timestamptz,
  email_held_at     timestamptz,
  hold_released_at  timestamptz,
  external_code     text,
  last_status       integer,
  last_error        text,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint integration_delivery_source_ref check (
    (source = 'hub' and booking_id is not null and wl_order_id is null)
    or (source = 'site' and booking_id is null and wl_order_id is not null)
  )
);
comment on table public.integration_delivery is
  'Fila de envio aos provedores de integração. hold_until segura o e-mail de confirmação (D4: até 15 min). Spec: docs/specs/integracoes.md';

create index if not exists integration_delivery_pending_idx
  on public.integration_delivery (next_attempt_at) where status = 'pending';
create index if not exists integration_delivery_hold_idx
  on public.integration_delivery (hold_until) where status = 'pending' and hold_released_at is null;
create index if not exists integration_delivery_booking_idx
  on public.integration_delivery (booking_id) where booking_id is not null;
create index if not exists integration_delivery_connection_idx
  on public.integration_delivery (connection_id, created_at desc);

create table if not exists public.integration_attempt (
  id           uuid primary key default gen_random_uuid(),
  delivery_id  uuid not null references public.integration_delivery(id) on delete cascade,
  http_status  integer,
  duration_ms  integer,
  request      jsonb,
  response     jsonb,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists integration_attempt_delivery_idx
  on public.integration_attempt (delivery_id, created_at desc);

create table if not exists public.integration_access_code (
  id             uuid primary key default gen_random_uuid(),
  connection_id  uuid not null references public.integration_connection(id) on delete cascade,
  company_id     uuid not null references public.company(id) on delete cascade,
  booking_id     uuid references public.booking(id) on delete cascade,
  wl_order_id    bigint,
  delivery_id    uuid references public.integration_delivery(id) on delete set null,
  code           text not null check (btrim(code) <> ''),
  status         text not null default 'active'
                   check (status in ('active', 'superseded', 'block_pending', 'blocked')),
  blocked_by     uuid references auth.users(id) on delete set null,
  blocked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint integration_access_code_ref check (
    (booking_id is not null and wl_order_id is null) or (booking_id is null and wl_order_id is not null)
  )
);
comment on table public.integration_access_code is
  'Código de acesso devolvido pelo provedor (QR do voucher). Um ativo por reserva e conexão. Spec: docs/specs/integracoes.md';

create unique index if not exists integration_access_code_active_booking_uidx
  on public.integration_access_code (booking_id, connection_id) where status = 'active' and booking_id is not null;
create index if not exists integration_access_code_booking_idx
  on public.integration_access_code (booking_id) where booking_id is not null;

-- updated_at
drop trigger if exists integration_connection_set_updated_at on public.integration_connection;
create trigger integration_connection_set_updated_at before update on public.integration_connection
  for each row execute function public.set_updated_at();
drop trigger if exists integration_delivery_set_updated_at on public.integration_delivery;
create trigger integration_delivery_set_updated_at before update on public.integration_delivery
  for each row execute function public.set_updated_at();
drop trigger if exists integration_access_code_set_updated_at on public.integration_access_code;
create trigger integration_access_code_set_updated_at before update on public.integration_access_code
  for each row execute function public.set_updated_at();

-- A empresa da conexão é sempre a da unidade: ninguém instala integração na unidade de outro.
create or replace function public.integration_connection_sync_company()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  select l.company_id into new.company_id
    from public.location l
   where l.id = new.location_id and l.deleted_at is null;
  if new.company_id is null then
    raise exception 'Unidade não encontrada para a integração.' using errcode = '23503';
  end if;
  return new;
end $function$;
revoke all on function public.integration_connection_sync_company() from public, anon, authenticated;

drop trigger if exists integration_connection_sync_company on public.integration_connection;
create trigger integration_connection_sync_company
  before insert or update of location_id, company_id on public.integration_connection
  for each row execute function public.integration_connection_sync_company();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS: fechadas para o cliente. hub_admin lê; parceiro só por RPC.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.integration_connection enable row level security;
alter table public.integration_delivery enable row level security;
alter table public.integration_attempt enable row level security;
alter table public.integration_access_code enable row level security;

revoke all on table public.integration_connection from anon, authenticated;
revoke all on table public.integration_delivery from anon, authenticated;
revoke all on table public.integration_attempt from anon, authenticated;
revoke all on table public.integration_access_code from anon, authenticated;
grant select on table public.integration_connection to authenticated;
grant select on table public.integration_delivery to authenticated;
grant select on table public.integration_attempt to authenticated;
grant select on table public.integration_access_code to authenticated;

drop policy if exists integration_connection_admin_select on public.integration_connection;
create policy integration_connection_admin_select on public.integration_connection
  for select to authenticated using (public.is_hub_admin());
drop policy if exists integration_delivery_admin_select on public.integration_delivery;
create policy integration_delivery_admin_select on public.integration_delivery
  for select to authenticated using (public.is_hub_admin());
drop policy if exists integration_attempt_admin_select on public.integration_attempt;
create policy integration_attempt_admin_select on public.integration_attempt
  for select to authenticated using (public.is_hub_admin());
drop policy if exists integration_access_code_admin_select on public.integration_access_code;
create policy integration_access_code_admin_select on public.integration_access_code
  for select to authenticated using (public.is_hub_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Configuração (RPCs com escopo)
-- ─────────────────────────────────────────────────────────────────────────────

-- Instala ou atualiza a conexão de um provedor numa unidade. Parâmetro nulo mantém o valor atual.
create or replace function public.integration_upsert_connection(
  p_location_id uuid,
  p_provider text,
  p_config jsonb default null,
  p_enabled boolean default null,
  p_send_hub_bookings boolean default null,
  p_send_site_bookings boolean default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company uuid;
  v_id uuid;
  v_secret uuid;
  v_config jsonb;
begin
  select l.company_id into v_company
    from public.location l
   where l.id = p_location_id and l.deleted_at is null;
  if v_company is null then
    raise exception 'Unidade não encontrada.' using errcode = '22023';
  end if;
  if not public.member_has_scope(v_company, 'integrations:write') then
    raise exception 'Só o Dono do estacionamento configura integrações.' using errcode = '42501';
  end if;
  if p_provider is null or p_provider not in ('cloudpark') then
    raise exception 'Provedor de integração desconhecido: %', p_provider using errcode = '22023';
  end if;
  if p_config is not null and jsonb_typeof(p_config) <> 'object' then
    raise exception 'Configuração inválida.' using errcode = '22023';
  end if;

  select c.id, c.secret_id, c.config into v_id, v_secret, v_config
    from public.integration_connection c
   where c.location_id = p_location_id and c.provider = p_provider and c.deleted_at is null
   for update;

  v_config := coalesce(p_config, v_config, '{}'::jsonb);
  if p_provider = 'cloudpark' then
    v_config := jsonb_set(v_config, '{base_url}',
      to_jsonb(rtrim(lower(btrim(coalesce(v_config->>'base_url', ''))), '/')));
    if v_config->>'base_url' !~ '^https://[a-z0-9-]+\.cloudpark\.com\.br$' then
      raise exception 'Endereço da Cloudpark inválido. Use o link de nuvem, como https://1234.cloudpark.com.br'
        using errcode = '22023';
    end if;
  end if;

  if coalesce(p_enabled, false) and v_secret is null then
    raise exception 'Salve o token antes de ligar a integração.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.integration_connection
      (location_id, company_id, provider, config, enabled, send_hub_bookings, send_site_bookings, created_by)
    values
      (p_location_id, v_company, p_provider, v_config, false,
       coalesce(p_send_hub_bookings, true), coalesce(p_send_site_bookings, false), auth.uid())
    returning id into v_id;
  else
    update public.integration_connection
       set config = v_config,
           enabled = coalesce(p_enabled, enabled),
           send_hub_bookings = coalesce(p_send_hub_bookings, send_hub_bookings),
           send_site_bookings = coalesce(p_send_site_bookings, send_site_bookings)
     where id = v_id;
  end if;
  return v_id;
end $function$;

-- Grava ou troca o token no Vault. Nenhuma leitura devolve o token: só o final, para conferência.
create or replace function public.integration_set_secret(p_connection_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company uuid;
  v_secret uuid;
  v_value text := btrim(coalesce(p_secret, ''));
begin
  select c.company_id, c.secret_id into v_company, v_secret
    from public.integration_connection c
   where c.id = p_connection_id and c.deleted_at is null
   for update;
  if v_company is null then
    raise exception 'Integração não encontrada.' using errcode = '22023';
  end if;
  if not public.member_has_scope(v_company, 'integrations:write') then
    raise exception 'Só o Dono do estacionamento configura integrações.' using errcode = '42501';
  end if;
  -- Quem cola "Token abc..." do Swagger da Cloudpark não precisa limpar o prefixo à mão.
  v_value := btrim(regexp_replace(v_value, '^token\s+', '', 'i'));
  if length(v_value) < 8 or length(v_value) > 512 then
    raise exception 'Token inválido.' using errcode = '22023';
  end if;

  if v_secret is null then
    v_secret := vault.create_secret(
      v_value,
      'integration_connection_' || p_connection_id::text,
      'Token da integração ' || p_connection_id::text
    );
  else
    perform vault.update_secret(v_secret, v_value);
  end if;

  update public.integration_connection
     set secret_id = v_secret,
         secret_hint = right(v_value, 4),
         auth_failed_at = null
   where id = p_connection_id;
end $function$;

-- Lista as conexões. hub_admin vê todas; parceiro, as da empresa com integrations:read.
create or replace function public.integration_connections(p_company_id uuid default null)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  location_id uuid,
  location_name text,
  provider text,
  enabled boolean,
  config jsonb,
  has_secret boolean,
  secret_hint text,
  send_hub_bookings boolean,
  send_site_bookings boolean,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_detail text,
  auth_failed_at timestamptz,
  pending_count integer,
  failed_24h integer,
  last_delivered_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_hub_admin() then
    if p_company_id is null or not public.member_has_scope(p_company_id, 'integrations:read') then
      raise exception 'Sem permissão para ver as integrações desta empresa.' using errcode = '42501';
    end if;
  end if;

  return query
    select c.id, c.company_id, co.name::text, c.location_id, l.name::text, c.provider, c.enabled,
           c.config, c.secret_id is not null, c.secret_hint, c.send_hub_bookings,
           c.send_site_bookings, c.last_test_at, c.last_test_ok, c.last_test_detail, c.auth_failed_at,
           (select count(*)::int from public.integration_delivery d
             where d.connection_id = c.id and d.status = 'pending'),
           (select count(*)::int from public.integration_delivery d
             where d.connection_id = c.id and d.status = 'failed'
               and d.updated_at > now() - interval '24 hours'),
           (select max(d.delivered_at) from public.integration_delivery d
             where d.connection_id = c.id and d.status = 'delivered'),
           c.created_at, c.updated_at
      from public.integration_connection c
      join public.company co on co.id = c.company_id
      join public.location l on l.id = c.location_id
     where c.deleted_at is null
       and (p_company_id is null or c.company_id = p_company_id)
     order by co.name, l.name, c.provider;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Motor (só service_role)
-- ─────────────────────────────────────────────────────────────────────────────

-- Token da conexão, para a Edge que entrega. Nunca exposto a authenticated.
create or replace function public.integration_connection_secret(p_connection_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select s.decrypted_secret
    from public.integration_connection c
    join vault.decrypted_secrets s on s.id = c.secret_id
   where c.id = p_connection_id;
$function$;

-- Reivindica entregas vencidas (FOR UPDATE SKIP LOCKED + concessão), como o wl_delivery_claim.
-- Com p_delivery_id, reivindica só aquela (tentativa imediata na confirmação do pagamento).
create or replace function public.integration_delivery_claim(
  p_limit integer default 20,
  p_lease interval default interval '5 minutes',
  p_delivery_id uuid default null
)
returns table (
  id uuid,
  connection_id uuid,
  company_id uuid,
  source text,
  booking_id uuid,
  wl_order_id bigint,
  operation text,
  payload jsonb,
  attempts integer,
  max_attempts integer,
  hold_until timestamptz,
  email_held_at timestamptz,
  hold_released_at timestamptz,
  provider text,
  location_id uuid,
  connection_enabled boolean,
  config jsonb
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with alvo as (
    select d.id
      from public.integration_delivery d
     where d.status = 'pending'
       and d.next_attempt_at <= now()
       and (p_delivery_id is null or d.id = p_delivery_id)
     order by d.next_attempt_at, d.id
     limit greatest(1, least(coalesce(p_limit, 20), 100))
     for update of d skip locked
  ),
  marcado as (
    update public.integration_delivery w
       set next_attempt_at = now() + coalesce(p_lease, interval '5 minutes')
      from alvo
     where w.id = alvo.id
    returning w.*
  )
  select m.id, m.connection_id, m.company_id, m.source, m.booking_id, m.wl_order_id, m.operation,
         m.payload, m.attempts, m.max_attempts, m.hold_until, m.email_held_at, m.hold_released_at,
         c.provider, c.location_id, (c.enabled and c.deleted_at is null), c.config
    from marcado m
    join public.integration_connection c on c.id = m.connection_id
   order by m.next_attempt_at, m.id;
end $function$;

-- Entregas cuja retenção do e-mail venceu (D4): marca a soltura e devolve, uma vez só cada.
create or replace function public.integration_hold_release_claim(p_limit integer default 50)
returns table (
  id uuid,
  connection_id uuid,
  company_id uuid,
  booking_id uuid,
  email_held_at timestamptz,
  provider text,
  last_error text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with alvo as (
    select d.id
      from public.integration_delivery d
     where d.status = 'pending'
       and d.hold_released_at is null
       and d.hold_until is not null
       and d.hold_until <= now()
     order by d.hold_until, d.id
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update of d skip locked
  ),
  marcado as (
    update public.integration_delivery w
       set hold_released_at = now()
      from alvo
     where w.id = alvo.id
    returning w.*
  )
  select m.id, m.connection_id, m.company_id, m.booking_id, m.email_held_at, c.provider, m.last_error
    from marcado m
    join public.integration_connection c on c.id = m.connection_id;
end $function$;

-- Código de acesso da reserva para o cliente e para a equipe da unidade (voucher na tela).
-- Reserva de outra pessoa devolve vazio, sem erro, para não confirmar que o código existe.
create or replace function public.booking_access_code(p_booking_code text)
returns table (code text, pending boolean)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking record;
  v_code text;
begin
  select b.id, b.profile_id, l.company_id into v_booking
    from public.booking b
    join public.location l on l.id = b.location_id
   where b.code = p_booking_code and b.deleted_at is null;
  if v_booking.id is null then
    return;
  end if;
  if not (
    (auth.uid() is not null and v_booking.profile_id = auth.uid())
    or public.member_has_scope(v_booking.company_id, 'bookings:read')
  ) then
    return;
  end if;

  select a.code into v_code
    from public.integration_access_code a
   where a.booking_id = v_booking.id and a.status = 'active'
   order by a.created_at desc
   limit 1;

  return query select v_code,
    v_code is null and exists (
      select 1 from public.integration_delivery d
       where d.booking_id = v_booking.id and d.status = 'pending'
         and d.hold_until is not null and d.hold_until > now()
    );
end $function$;

-- Saúde por conexão (Manager). Só hub_admin.
create or replace function public.integration_health()
returns table (
  connection_id uuid,
  company_name text,
  location_name text,
  provider text,
  enabled boolean,
  stuck_pending integer,
  failed_24h integer,
  last_delivered_at timestamptz,
  auth_failed_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark vê a saúde das integrações.' using errcode = '42501';
  end if;
  return query
    select c.id, co.name::text, l.name::text, c.provider, c.enabled,
           (select count(*)::int from public.integration_delivery d
             where d.connection_id = c.id and d.status = 'pending'
               and d.created_at < now() - interval '5 minutes'),
           (select count(*)::int from public.integration_delivery d
             where d.connection_id = c.id and d.status = 'failed'
               and d.updated_at > now() - interval '24 hours'),
           (select max(d.delivered_at) from public.integration_delivery d
             where d.connection_id = c.id and d.status = 'delivered'),
           c.auth_failed_at
      from public.integration_connection c
      join public.company co on co.id = c.company_id
      join public.location l on l.id = c.location_id
     where c.deleted_at is null
     order by co.name, l.name;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Enfileiramento: reserva confirmada → entrega pendente (com retenção do e-mail)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.integration_enqueue_booking()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status is distinct from 'confirmed' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    return null;
  end if;
  begin
    insert into public.integration_delivery
      (connection_id, company_id, source, booking_id, operation, idempotency_key, hold_until)
    select c.id, c.company_id, 'hub', new.id, 'reserve',
           'hub:' || new.id::text || ':reserve:' || c.id::text,
           now() + interval '15 minutes'
      from public.integration_connection c
     where c.location_id = new.location_id
       and c.enabled
       and c.send_hub_bookings
       and c.deleted_at is null
       and not exists (
         select 1 from public.integration_access_code a
          where a.booking_id = new.id and a.connection_id = c.id and a.status = 'active'
       )
    on conflict (idempotency_key) do nothing;
  exception when others then
    -- A integração nunca derruba a confirmação do pagamento.
    raise warning 'integration_enqueue_booking(%): %', new.id, sqlerrm;
  end;
  return null;
end $function$;

drop trigger if exists booking_integration_enqueue on public.booking;
create trigger booking_integration_enqueue
  after insert or update of status on public.booking
  for each row execute function public.integration_enqueue_booking();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants (default privilege do Supabase concede EXECUTE a anon/authenticated: revogar nominal)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.integration_upsert_connection(uuid, text, jsonb, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.integration_upsert_connection(uuid, text, jsonb, boolean, boolean, boolean) to authenticated, service_role;

revoke all on function public.integration_set_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.integration_set_secret(uuid, text) to authenticated, service_role;

revoke all on function public.integration_connections(uuid) from public, anon, authenticated;
grant execute on function public.integration_connections(uuid) to authenticated, service_role;

revoke all on function public.booking_access_code(text) from public, anon, authenticated;
grant execute on function public.booking_access_code(text) to authenticated, service_role;

revoke all on function public.integration_health() from public, anon, authenticated;
grant execute on function public.integration_health() to authenticated, service_role;

revoke all on function public.integration_connection_secret(uuid) from public, anon, authenticated;
grant execute on function public.integration_connection_secret(uuid) to service_role;

revoke all on function public.integration_delivery_claim(integer, interval, uuid) from public, anon, authenticated;
grant execute on function public.integration_delivery_claim(integer, interval, uuid) to service_role;

revoke all on function public.integration_hold_release_claim(integer) from public, anon, authenticated;
grant execute on function public.integration_hold_release_claim(integer) to service_role;

revoke all on function public.integration_enqueue_booking() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Cron: chave interna no Vault (padrão review_request_key) e chamada só quando há trabalho
-- ─────────────────────────────────────────────────────────────────────────────
select vault.create_secret(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'integration_deliver_key',
  'Chave interna do cron integration-deliver (cron envia no header; Edge lê via RPC).'
)
 where not exists (select 1 from vault.secrets where name = 'integration_deliver_key');

create or replace function public.integration_deliver_expected_key()
returns text
language sql
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'integration_deliver_key' limit 1;
$$;
revoke all on function public.integration_deliver_expected_key() from public, anon, authenticated;
grant execute on function public.integration_deliver_expected_key() to service_role;

select cron.unschedule('integration-deliver')
 where exists (select 1 from cron.job where jobname = 'integration-deliver');
select cron.schedule(
  'integration-deliver',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/integration-deliver',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-integration-deliver-key',
      (select decrypted_secret from vault.decrypted_secrets where name = 'integration_deliver_key')
    ),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.integration_delivery d
     where d.status = 'pending'
       and (d.next_attempt_at <= now()
            or (d.hold_released_at is null and d.hold_until is not null and d.hold_until <= now()))
  );
  $job$
);
