-- E1.3 — Campos de KYC do recebedor (PJ). Estende company_payout_account com o
-- register_information completo do Pagar.me (em jsonb) e adiciona a RPC que o operador usa no
-- wizard (passo "Recebimento"). O Manager (hub_admin) escreve direto pela RLS admin_all.
-- Ver docs/specs/payment-split.md.

-- register_information além de banco/identidade (endereço, telefone, faturamento, fundação,
-- tipo societário e representante legal). Validado no front pelo schema Zod (src/features/payouts/kyc.ts).
alter table public.company_payout_account
  add column if not exists kyc_details jsonb not null default '{}'::jsonb;

-- Upsert pelo operador (wizard). Guarda de propriedade + status via onboarding_assert_editable;
-- bumpa o passo 6 (Recebimento). Bank/identidade vão em colunas planas; o resto em kyc_details.
create or replace function public.onboarding_upsert_payout_account(
  p_company_id uuid,
  p_account jsonb
) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.onboarding_assert_editable(p_company_id);

  insert into public.company_payout_account (
    company_id, legal_name, document, document_type,
    bank_code, branch_number, branch_check_digit, account_number, account_check_digit,
    account_type, holder_name, holder_document, kyc_details
  ) values (
    p_company_id,
    nullif(trim(p_account->>'legal_name'), ''),
    nullif(p_account->>'document', ''),
    nullif(p_account->>'document_type', ''),
    nullif(p_account->>'bank_code', ''),
    nullif(p_account->>'branch_number', ''),
    nullif(p_account->>'branch_check_digit', ''),
    nullif(p_account->>'account_number', ''),
    nullif(p_account->>'account_check_digit', ''),
    nullif(p_account->>'account_type', ''),
    nullif(p_account->>'holder_name', ''),
    nullif(p_account->>'holder_document', ''),
    coalesce(p_account->'kyc_details', '{}'::jsonb)
  )
  on conflict (company_id) do update set
    legal_name          = excluded.legal_name,
    document            = excluded.document,
    document_type       = excluded.document_type,
    bank_code           = excluded.bank_code,
    branch_number       = excluded.branch_number,
    branch_check_digit  = excluded.branch_check_digit,
    account_number      = excluded.account_number,
    account_check_digit = excluded.account_check_digit,
    account_type        = excluded.account_type,
    holder_name         = excluded.holder_name,
    holder_document     = excluded.holder_document,
    kyc_details         = excluded.kyc_details,
    deleted_at          = null;

  perform public.onboarding_bump_step(p_company_id, 6);
end; $$;

revoke all on function public.onboarding_upsert_payout_account(uuid, jsonb) from public;
grant all on function public.onboarding_upsert_payout_account(uuid, jsonb) to authenticated, service_role;
