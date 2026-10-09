-- Segurança da integração white-label e das colunas de `company` (08/10/2026).
-- Spec: docs/specs/shared-availability.md (§ Segurança) e permissions.md.
--
-- O que estava aberto, medido em produção em 08/10/2026:
--
--   1. A policy `catalog_read_company` (anon e authenticated) libera a LINHA de toda empresa ativa,
--      e a tabela tinha SELECT em todas as colunas para os dois papéis. Pela chave pública, que vai
--      no navegador, qualquer um lia de 9 empresas: o IP de aceite do contrato (2 preenchidos), a
--      comissão da Movepark, o tenant do white-label, a configuração de repasse e o segredo do
--      webhook WPS (vazio em todas por sorte). O cliente logado lia o mesmo.
--      Agora o privilégio é por coluna:
--        - anon: só o que a vitrine usa (id, nome, slug, razão social, CNPJ, status, logo, datas);
--        - authenticated: tudo MENOS quatro colunas que nenhuma tela de cliente ou parceiro lê direto:
--          `wps_webhook_secret` (segredo), `contract_accepted_ip` (dado pessoal), `wl_tenant_key` e
--          `take_rate_bps` (comercial). O Manager lê essas quatro por `manager_company_restricted`.
--      Consequência para quem escreve código: `select("*")` em `company` deixa de funcionar para o
--      front. Liste as colunas (src/features/companies/api.ts tem a constante). Coluna nova NÃO é
--      concedida a ninguém automaticamente: ao criar, decida aqui se anon e authenticated leem.
--   2. anon e authenticated tinham INSERT/UPDATE/DELETE/TRUNCATE de tabela em `company`, barrados só
--      pela RLS (`company_admin_write` exige hub_admin). anon perde tudo; authenticated mantém
--      INSERT/UPDATE (o Manager cria e edita empresa pelo PostgREST, com a RLS por trás) e perde
--      DELETE e TRUNCATE, que nenhuma tela usa (o desligamento é soft delete por UPDATE).
--   3. `wl_domain` e `wl_public_domain` aceitavam qualquer texto (e `wl_public_host`, que monta o
--      link de saída, deixava passar porta e usuário@). O token de backend do legado vale
--      para todos os tenants, e um domínio mal cadastrado (IP, porta, usuário@host) mandaria o
--      token para outro lugar. O banco passa a exigir hostname puro; o sufixo permitido é conferido
--      no cliente das Edges (`_shared/wl/client.ts`), derivado do host canônico (`_shared/site.ts`),
--      porque o host não é escrito à mão nem no banco.
--   4. `wl_company_config` liberava a config de integração para qualquer membro, sem escopo
--      (contrariava o ADR-005). Agora exige `occupancy:read`, que é a tela que a usa (Ocupação).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 e 2. Privilégios por coluna
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on table public.company from anon;
revoke select, delete, truncate, references, trigger on table public.company from authenticated;

grant select (
  id, name, slug, legal_name, tax_id, status, created_at, updated_at, deleted_at,
  onboarding_status, logo_url
) on public.company to anon;

grant select (
  id, name, slug, legal_name, tax_id, status, created_at, updated_at, deleted_at,
  onboarding_status, logo_url,
  wl_domain, wl_sync_enabled, wl_public_domain, hub_relationship,
  wps_webhook_url, wps_webhook_enabled,
  contract_accepted_at, contract_version, contract_sha256, contract_accepted_by,
  monthly_revenue_goal_cents, gateway_split_enabled,
  payout_release_days, payout_auto_day, payout_auto_enabled
) on public.company to authenticated;

-- O que fica de fora do authenticated, servido só ao hub_admin.
create or replace function public.manager_company_restricted(p_company_ids uuid[])
returns table (
  id uuid,
  take_rate_bps integer,
  wl_tenant_key text,
  has_wps_webhook_secret boolean,
  contract_accepted_ip text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark lê esses dados da empresa.' using errcode = '42501';
  end if;

  -- O segredo do WPS nunca sai: só se ele existe (o formulário trata como só gravação).
  return query
    select c.id, c.take_rate_bps::integer, c.wl_tenant_key,
           nullif(btrim(coalesce(c.wps_webhook_secret, '')), '') is not null,
           c.contract_accepted_ip::text
      from public.company c
     where c.id = any (coalesce(p_company_ids, '{}'::uuid[]));
end $function$;

revoke all on function public.manager_company_restricted(uuid[]) from public, anon;
grant execute on function public.manager_company_restricted(uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Domínios do white-label: só hostname
-- ─────────────────────────────────────────────────────────────────────────────
-- Rótulos de letras, números e hífen, separados por ponto, terminando num TLD de letras: recusa
-- esquema, caminho, porta, usuário@, espaço e IP literal.
alter table public.company drop constraint if exists company_wl_domain_hostname;
alter table public.company add constraint company_wl_domain_hostname check (
  wl_domain is null
  or wl_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
);

alter table public.company drop constraint if exists company_wl_public_domain_hostname;
-- O domínio público aceita a forma com esquema e barra ("https://x/"), que `wl_public_host`
-- normaliza ao montar o link de saída; o que se confere é o host que sai dela.
alter table public.company add constraint company_wl_public_domain_hostname check (
  wl_public_domain is null
  or public.wl_public_host(wl_public_domain) ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wl_company_config com escopo
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.wl_company_config(p_company_id uuid)
returns table (wl_domain text, wl_tenant_key text, wl_sync_enabled boolean)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- ADR-005: membro precisa do escopo da tela que usa a config (Ocupação). hub_admin passa sempre
  -- (o catálogo do De/Para é do Manager).
  if not public.is_hub_admin()
     and not public.member_has_scope(p_company_id, 'occupancy:read') then
    raise exception 'Sem permissão para a config de integração desta empresa.' using errcode = '42501';
  end if;

  return query
    select c.wl_domain, c.wl_tenant_key, c.wl_sync_enabled
      from public.company c
     where c.id = p_company_id and c.deleted_at is null;
end; $function$;

revoke all on function public.wl_company_config(uuid) from public, anon;
grant execute on function public.wl_company_config(uuid) to authenticated, service_role;
