-- E2.5.1 · O path da API do WL é fixo (/api/v3/backend) para todos os tenants.
-- Então guardamos só o DOMÍNIO do backend (host); a URL da API é montada no código
-- como https://<wl_domain>/api/v3/backend. Renomeia wl_base_url → wl_domain.

alter table public.company drop constraint if exists company_wl_sync_requires_config;

alter table public.company rename column wl_base_url to wl_domain;

comment on column public.company.wl_domain is
  'Domínio do backend white-label (host, ex: ferapark.movepark.com.br). A URL da API é https://<wl_domain>/api/v3/backend. NULL = sem integração.';

alter table public.company
  add constraint company_wl_sync_requires_config
  check (
    wl_sync_enabled = false
    or (wl_domain is not null and wl_tenant_key is not null)
  );
