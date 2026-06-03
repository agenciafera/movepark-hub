-- Partner Onboarding — schema base
-- Cadastro de parceiros em 2 etapas: captura de lead -> aprovação -> wizard -> go-live.
-- Reaproveita o modelo de roles existente (profiles.role / profile_company); NÃO cria company_member.

-- 1. Estado de cadastro (ortogonal ao company.status operacional)
create type public.onboarding_status as enum (
  'pending_review',  -- lead capturado, aguardando triagem
  'approved',        -- aprovado, convite enviado
  'in_progress',     -- parceiro preenchendo o wizard
  'active',          -- publicado (go-live automático ao enviar)
  'rejected'         -- recusado (terminal)
);

-- 2. Coluna de cadastro em company + logo (não existia)
alter table public.company
  add column onboarding_status public.onboarding_status,
  add column logo_url text;

-- empresas já existentes em produção estão no ar
update public.company set onboarding_status = 'active' where onboarding_status is null;

alter table public.company
  alter column onboarding_status set default 'pending_review',
  alter column onboarding_status set not null;

create index company_onboarding_status_idx on public.company (onboarding_status);

-- 3. Fotos da unidade (não existia) — array de paths no Storage; primeiro = capa
alter table public.location
  add column photos jsonb not null default '[]'::jsonb;

-- 4. Metadados de lead/onboarding (1:1 com company)
create table public.company_onboarding (
  company_id          uuid primary key references public.company(id) on delete cascade,
  -- contato (Stage 1)
  contact_name        text not null,
  contact_email       text not null,
  contact_phone       text not null,
  contact_role        text,
  -- qualificação
  city                text,
  state               text,
  estimated_spots     integer,
  message             text,
  -- atribuição
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  referrer            text,
  -- progresso do wizard (Stage 2)
  current_step        integer not null default 0,
  -- ciclo de vida
  submitted_at        timestamptz not null default now(),  -- lead enviado
  approved_at         timestamptz,
  approved_by         uuid references auth.users(id) on delete set null,
  rejected_at         timestamptz,
  rejection_reason    text,
  setup_submitted_at  timestamptz,                          -- wizard enviado / go-live
  went_live_at        timestamptz,
  internal_note       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index company_onboarding_email_idx on public.company_onboarding (lower(contact_email));
create index company_onboarding_submitted_at_idx on public.company_onboarding (submitted_at desc);

create trigger company_onboarding_set_updated_at
  before update on public.company_onboarding
  for each row execute function public.set_updated_at();
