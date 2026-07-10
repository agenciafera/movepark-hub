-- Captura progressiva de lead de parceiro (abandono).
-- O passo 1 do modal de "Seja parceiro" salva e-mail + WhatsApp aqui na hora;
-- se a pessoa desistir do restante, o contato já fica registrado pra follow-up.
-- A submissão COMPLETA continua no submit-partner-lead (cria company/onboarding).

create table if not exists public.partner_lead (
  id              uuid primary key default gen_random_uuid(),
  contact_email   text not null,
  contact_phone   text,
  contact_name    text,
  company_name    text,
  city            text,
  state           text,
  estimated_spots integer,
  status          text not null default 'partial' check (status in ('partial', 'complete')),
  step            integer not null default 1,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  referrer        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Upsert por e-mail (uma linha por contato, atualizada a cada passo).
create unique index if not exists partner_lead_email_key on public.partner_lead (contact_email);
create index if not exists partner_lead_status_idx on public.partner_lead (status, created_at desc);

-- RLS trancada: acesso só pela Edge (service_role), mesmo padrão do submit-partner-lead.
alter table public.partner_lead enable row level security;

drop trigger if exists partner_lead_set_updated_at on public.partner_lead;
create trigger partner_lead_set_updated_at
  before update on public.partner_lead
  for each row execute function public.set_updated_at();
