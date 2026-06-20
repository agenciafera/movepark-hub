-- E2.5.1 · Integração de disponibilidade Hub ↔ white-label legado (config por empresa).
--
-- O Hub, por si só, não sabe qual `company` corresponde a qual tenant do WL.
-- A relação é resolvida AQUI, por empresa:
--   • wl_base_url    → onde integrar (base da API do backoffice WL, ex: https://<tenant>/api/v3/backend)
--   • wl_tenant_key  → quem é (header X-Tenant = whitelabel key do WL)
--   • wl_sync_enabled→ liga/desliga a sincronização desta empresa
--
-- O Bearer (BACKEND_API_SECRET_ACCESS_KEY do WL) é GLOBAL e vive nos secrets do
-- Supabase (WL_BACKEND_TOKEN) — nunca no banco nem no front. Aqui só guardamos
-- a URL e a chave de tenant (não-sensíveis), governadas pela RLS existente de `company`.

alter table public.company
  add column if not exists wl_base_url text,
  add column if not exists wl_tenant_key text,
  add column if not exists wl_sync_enabled boolean not null default false;

comment on column public.company.wl_base_url is
  'Base URL da API do backoffice white-label legado para esta empresa (ex: https://<tenant>/api/v3/backend). NULL = sem integração.';
comment on column public.company.wl_tenant_key is
  'Whitelabel key do WL usada no header X-Tenant. Mapeia esta company → tenant do legado.';
comment on column public.company.wl_sync_enabled is
  'Liga/desliga a sincronização de disponibilidade Hub ↔ WL para esta empresa.';

-- Só faz sentido sincronizar quem tem URL + tenant configurados.
alter table public.company
  drop constraint if exists company_wl_sync_requires_config;
alter table public.company
  add constraint company_wl_sync_requires_config
  check (
    wl_sync_enabled = false
    or (wl_base_url is not null and wl_tenant_key is not null)
  );
