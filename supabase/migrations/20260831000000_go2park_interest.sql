-- Interesse na Go2Park (produto irmão de rastreio de vans de transfer em tempo real).
-- No onboarding, o dono pode demonstrar interesse; o time da Go2Park recebe o lead por
-- e-mail (Edge submit-go2park-interest) e o Manager vê um selo no detalhe do parceiro.
-- O flag mora na company_onboarding porque o Manager já lê a linha inteira (select *),
-- então aparece no PartnerApplication sem tocar o select.

alter table public.company_onboarding
  add column if not exists go2park_interest boolean not null default false,
  add column if not exists go2park_interest_at timestamptz;

-- Caixa que recebe o lead de interesse na Go2Park (editável no Manager, sem redeploy).
-- Mesma mecânica de partner_leads_inbox/partner_email_from (ver _shared/email.ts).
insert into public.app_setting (key, value)
values ('go2park_leads_inbox', 'contato@go2park.com.br')
on conflict (key) do nothing;
