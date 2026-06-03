-- Configurações globais editáveis pelo hub_admin (key/value).
-- Usado pelo onboarding de parceiros para remetente/caixa de e-mail (editável no Manager).

create table public.app_setting (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz not null default now()
);

create trigger app_setting_set_updated_at
  before update on public.app_setting
  for each row execute function public.set_updated_at();

alter table public.app_setting enable row level security;

-- somente hub_admin lê/escreve; edge functions usam service_role (bypassa RLS)
create policy app_setting_admin_all on public.app_setting
  for all to authenticated
  using (public.is_hub_admin())
  with check (public.is_hub_admin());

grant select, insert, update on public.app_setting to authenticated;

-- defaults do onboarding
insert into public.app_setting (key, value) values
  ('partner_email_from', 'hub@movepark.co'),
  ('partner_leads_inbox', '')
on conflict (key) do nothing;
