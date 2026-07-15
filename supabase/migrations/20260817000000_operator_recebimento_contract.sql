-- E1.3 (fatia): recebimento self-service do operador + contrato (simulado).
-- Hoje o form de recebimento (PayoutKycForm) só salvava pelo Manager (hub_admin). Aqui abrimos a
-- escrita do próprio recebimento pro DONO da empresa (ADR-005: recebimento/KYC é exclusivo do owner)
-- e adicionamos a etapa de contrato (assinatura simulada por enquanto). Isso liga a "etapa 2" da
-- tela pós-publicação (unit-preview) a um fluxo real. Ver partner-onboarding-redesign.md.

-- 1. Owner escreve o próprio company_payout_account (dados bancários/CNPJ). RLS: is_company_owner
--    (que já inclui hub_admin). O SELECT do operador já existia; DELETE não é liberado.
do $$ begin
  create policy company_payout_account_owner_write on public.company_payout_account
    for insert to authenticated
    with check (public.is_company_owner(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy company_payout_account_owner_update on public.company_payout_account
    for update to authenticated
    using (public.is_company_owner(company_id))
    with check (public.is_company_owner(company_id));
exception when duplicate_object then null; end $$;

-- 2. Contrato Movepark ↔ estacionamento (assinatura simulada por enquanto).
alter table public.company
  add column if not exists contract_accepted_at timestamptz,
  add column if not exists contract_version text;

comment on column public.company.contract_accepted_at is
  'Quando o dono assinou o contrato com a Movepark (etapa final do recebimento). Simulado por ora.';

-- 3. RPC de aceite do contrato — só o dono (ADR-005). Simulada: registra aceite, sem e-sign real.
create or replace function public.operator_accept_contract(p_company_id uuid, p_version text default 'v1')
  returns void
  language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.is_company_owner(p_company_id) then
    raise exception 'Apenas o dono da empresa pode assinar o contrato.' using errcode = '42501';
  end if;
  update public.company
    set contract_accepted_at = now(), contract_version = coalesce(nullif(p_version, ''), 'v1')
    where id = p_company_id;
end;
$$;

alter function public.operator_accept_contract(uuid, text) owner to postgres;
revoke all on function public.operator_accept_contract(uuid, text) from public, anon;
grant execute on function public.operator_accept_contract(uuid, text) to authenticated, service_role;
