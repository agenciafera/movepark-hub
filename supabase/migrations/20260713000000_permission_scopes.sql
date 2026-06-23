-- Permissões por escopo (ADR-005) — passo B: catálogo de escopos in-app, presets fixos e helpers.
-- A unidade única de permissão passa a ser o ESCOPO (mesmo vocabulário da Public API). Os 4 papéis
-- fixos (owner/manager/operator/finance) viram pacotes seedados em company_role_scope. UI, RLS/RPC e
-- chaves de API falam a mesma língua. Sem construtor de regras (presets fixos).
-- Depende da migration A (valores 'manager'/'finance' do enum já commitados, noutra transação).

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Escopos in-app no catálogo + flag de "atribuível a chave de API"
-- ════════════════════════════════════════════════════════════════════════════
-- Escopos só-internos (team/api-keys/finance/payouts) NÃO podem ser dados a uma chave de API;
-- pricing:write pode (é uma escrita de catálogo, espelhável no gateway no futuro).
alter table public.api_scope
  add column if not exists assignable_to_api_key boolean not null default true;

insert into public.api_scope (scope, module, description, assignable_to_api_key) values
  ('pricing:write',  'pricing',  'Editar regra de preço/tiers e bloquear datas', true),
  ('finance:read',   'finance',  'Ver extrato/comissões/repasses',                false),
  ('payouts:read',   'payouts',  'Ver saldo a repassar / dados do recebedor',     false),
  ('payouts:write',  'payouts',  'Solicitar saque / editar dados bancários (KYC)', false),
  ('team:read',      'team',     'Listar usuários da empresa',                    false),
  ('team:write',     'team',     'Convidar, alterar papel e remover usuários',    false),
  ('api-keys:write', 'api-keys', 'Criar, rotacionar, revogar e editar chaves de API', false)
on conflict (scope) do update set
  module = excluded.module,
  description = excluded.description,
  assignable_to_api_key = excluded.assignable_to_api_key;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) api_assert_scopes passa a rejeitar escopo não-atribuível em chave de API
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.api_assert_scopes(p_scopes text[])
returns void language plpgsql stable security definer set search_path to 'public' as $kscopecheck$
declare v_bad text;
begin
  if p_scopes is null then return; end if;
  -- escopo inexistente no catálogo
  select s into v_bad from unnest(p_scopes) s
  where s not in (select scope from public.api_scope) limit 1;
  if v_bad is not null then
    raise exception 'Escopo inválido: %', v_bad using errcode = 'P0001';
  end if;
  -- escopo só-interno (não pode ir pra chave de API)
  select s.scope into v_bad
  from public.api_scope s
  where s.scope = any(p_scopes) and s.assignable_to_api_key = false limit 1;
  if v_bad is not null then
    raise exception 'Escopo não disponível para chave de API: %', v_bad using errcode = 'P0001';
  end if;
end; $kscopecheck$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Presets fixos: company_role_scope (papel → conjunto de escopos)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.company_role_scope (
  role  public.company_role not null,
  scope text not null references public.api_scope(scope) on delete cascade,
  primary key (role, scope)
);

alter table public.company_role_scope enable row level security;
do $$ begin
  create policy company_role_scope_read on public.company_role_scope
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Seed AUTORITATIVO (delete + insert → idempotente e exato a cada re-run).
delete from public.company_role_scope;

-- owner (Dono): TODOS os escopos do catálogo.
insert into public.company_role_scope (role, scope)
  select 'owner', scope from public.api_scope;

-- manager (Gerente): tudo, MENOS gerir usuários, gerir chaves e mover dinheiro.
insert into public.company_role_scope (role, scope)
  select 'manager', scope from public.api_scope
  where scope not in ('team:write', 'api-keys:write', 'payouts:write');

-- operator (Operação): reservas + check-in + ocupação + leitura de catálogo/preço.
insert into public.company_role_scope (role, scope) values
  ('operator', 'locations:read'),
  ('operator', 'parking-types:read'),
  ('operator', 'availability:read'),
  ('operator', 'pricing:read'),
  ('operator', 'occupancy:read'),
  ('operator', 'faq:read'),
  ('operator', 'bookings:read'),
  ('operator', 'bookings:write'),
  ('operator', 'bookings:cancel'),
  ('operator', 'bookings:checkin'),
  ('operator', 'reviews:read'),
  ('operator', 'wps:write'),
  ('operator', 'team:read');

-- finance (Financeiro): financeiro/repasses (leitura) + reservas (leitura) + leitura de catálogo.
insert into public.company_role_scope (role, scope) values
  ('finance', 'locations:read'),
  ('finance', 'parking-types:read'),
  ('finance', 'availability:read'),
  ('finance', 'pricing:read'),
  ('finance', 'occupancy:read'),
  ('finance', 'faq:read'),
  ('finance', 'bookings:read'),
  ('finance', 'finance:read'),
  ('finance', 'payouts:read'),
  ('finance', 'team:read');

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Helpers de escopo (SECURITY DEFINER p/ não recursar no RLS)
-- ════════════════════════════════════════════════════════════════════════════
-- Conjunto de escopos do usuário logado naquela empresa. hub_admin e dono → todos.
create or replace function public.current_member_scopes(p_company_id uuid)
returns setof text language sql stable security definer set search_path to 'public' as $cms$
  -- hub_admin OU dono → catálogo inteiro
  select s.scope from public.api_scope s
  where public.is_hub_admin()
     or exists (
       select 1 from public.profile_company pc
       where pc.profile_id = auth.uid() and pc.company_id = p_company_id and pc.role = 'owner'
     )
  union
  -- demais papéis → escopos do preset do papel
  select crs.scope
  from public.profile_company pc
  join public.company_role_scope crs on crs.role = pc.role
  where pc.profile_id = auth.uid() and pc.company_id = p_company_id;
$cms$;

-- O usuário logado tem ESTE escopo nesta empresa? (chokepoint do gating server-side)
create or replace function public.member_has_scope(p_company_id uuid, p_scope text)
returns boolean language sql stable security definer set search_path to 'public' as $mhs$
  select public.is_hub_admin() or exists (
    select 1
    from public.profile_company pc
    join public.company_role_scope crs on crs.role = pc.role and crs.scope = p_scope
    where pc.profile_id = auth.uid() and pc.company_id = p_company_id
  );
$mhs$;

grant all on function public.current_member_scopes(uuid) to authenticated, service_role;
grant all on function public.member_has_scope(uuid, text) to authenticated, service_role;
