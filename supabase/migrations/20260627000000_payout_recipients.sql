-- E0.1.1 — Recebedores / payout (gateway com split). Camada de vínculo parceiro ↔ recebedor
-- do gateway, gateway-agnóstica (ADR-004: Pagar.me via recebedores; trocável no futuro sem
-- reescrever o domínio). Ver docs/specs/payment-split.md.
--
-- Três concerns:
--   1. take_rate (comissão da Movepark) — por empresa, em basis points. AGNÓSTICO.
--   2. company_payout_account — dados de banco/KYC do parceiro. AGNÓSTICO (1:1 com company).
--   3. payout_recipient — registro do recebedor no gateway (id externo, status, link de
--      verificação, pendências). ESPECÍFICO por provider.
--   + payout_recipient_event — log append-only das respostas do gateway (pendências p/ o parceiro).
--
-- RLS: hub_admin full; company_operator só LÊ as próprias linhas. Escrita sempre via service_role
-- (Edge sync-recipient), nunca por RLS — segue o padrão de api_request_log / company_onboarding.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. take_rate por empresa (basis points: 1500 = 15%). Default global em app_setting.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.app_setting (key, value)
  values ('default_take_rate_bps', '1500')
  on conflict (key) do nothing;

alter table public.company
  add column if not exists take_rate_bps integer not null default 1500
    check (take_rate_bps between 0 and 10000);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Ciclo de vida da ficha do recebedor (normalizado, agnóstico ao gateway).
--    draft → pending → action_required → active | refused ; active → suspended.
-- ───────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.payout_recipient_status as enum
    ('draft', 'pending', 'action_required', 'active', 'refused', 'suspended');
exception when duplicate_object then null; end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Dados de repasse do parceiro (banco/KYC) — agnóstico, 1:1 com company.
--    Preenchido manualmente p/ o recebedor de teste agora; formulário em E1.3.
--    NUNCA exposto ao front: protegido por RLS (operator lê só o próprio).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.company_payout_account (
  company_id          uuid primary key references public.company(id) on delete cascade,
  legal_name          text,
  document            text,                                              -- CNPJ/CPF (só dígitos)
  document_type       text check (document_type in ('cnpj', 'cpf')),
  bank_code           text,                                              -- código do banco (ex: '341')
  branch_number       text,
  branch_check_digit  text,
  account_number      text,
  account_check_digit text,
  account_type        text check (account_type in ('checking', 'savings')),
  holder_name         text,
  holder_document     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Registro do recebedor no gateway — específico por provider.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.payout_recipient (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.company(id) on delete cascade,
  provider              text not null default 'pagarme',
  external_recipient_id text,                                            -- recipient_id no gateway
  status                public.payout_recipient_status not null default 'draft',
  last_provider_status  text,                                            -- status cru do gateway
  kyc_url               text,                                            -- link de verificação do gateway
  requirements          jsonb not null default '[]'::jsonb,              -- pendências normalizadas
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- Um recebedor vivo por (empresa, provider).
create unique index if not exists payout_recipient_company_provider_uidx
  on public.payout_recipient (company_id, provider) where deleted_at is null;
create index if not exists payout_recipient_company_idx
  on public.payout_recipient (company_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Log append-only das interações com o gateway (resposta crua → pendências).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.payout_recipient_event (
  id                  uuid primary key default gen_random_uuid(),
  payout_recipient_id uuid not null references public.payout_recipient(id) on delete cascade,
  kind                text not null check (kind in ('create', 'refresh', 'webhook')),
  http_status         integer,
  request             jsonb,                                             -- redigido (sem segredo)
  response            jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists payout_recipient_event_recipient_idx
  on public.payout_recipient_event (payout_recipient_id, created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Triggers de updated_at.
-- ───────────────────────────────────────────────────────────────────────────
create or replace trigger company_payout_account_set_updated_at
  before update on public.company_payout_account
  for each row execute function public.set_updated_at();
create or replace trigger payout_recipient_set_updated_at
  before update on public.payout_recipient
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. RLS — hub_admin full; operator só SELECT do próprio; escrita só via service_role.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.company_payout_account enable row level security;
alter table public.payout_recipient enable row level security;
alter table public.payout_recipient_event enable row level security;

do $$ begin
  create policy company_payout_account_admin_all on public.company_payout_account
    to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy company_payout_account_operator_select on public.company_payout_account
    for select to authenticated
    using (company_id in (select public.current_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy payout_recipient_admin_all on public.payout_recipient
    to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payout_recipient_operator_select on public.payout_recipient
    for select to authenticated
    using (company_id in (select public.current_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy payout_recipient_event_admin_all on public.payout_recipient_event
    to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payout_recipient_event_operator_select on public.payout_recipient_event
    for select to authenticated using (
      exists (
        select 1 from public.payout_recipient r
        where r.id = payout_recipient_id
          and r.company_id in (select public.current_company_ids())
      )
    );
exception when duplicate_object then null; end $$;
