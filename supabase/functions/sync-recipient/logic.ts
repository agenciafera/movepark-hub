// Lógica pura de sync-recipient (testável sem rede/Supabase): validação de input, mapeamento
// de `company_payout_account` → `RecipientInput` e redação de dados sensíveis para o log.

import type { RecipientInput, RecipientKyc } from "../_shared/payments/types.ts";

export type SyncAction = "create" | "refresh";

export interface SyncInput {
  company_id: string;
  action: SyncAction;
  provider: string;
}

/** Valida e normaliza o input. Retorna `{ input }` ou `{ error }` (mensagem em pt-BR). */
export function parseSyncInput(raw: unknown): { input?: SyncInput; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "Corpo inválido." };
  const o = raw as Record<string, unknown>;
  const companyId = typeof o.company_id === "string" ? o.company_id.trim() : "";
  if (!companyId) return { error: "company_id é obrigatório." };
  const action = o.action;
  if (action !== "create" && action !== "refresh") {
    return { error: "action precisa ser 'create' ou 'refresh'." };
  }
  const provider =
    typeof o.provider === "string" && o.provider.trim() ? o.provider.trim() : "pagarme";
  return { input: { company_id: companyId, action, provider } };
}

/** Linha de `company_payout_account` (subset usado aqui). */
export interface PayoutAccountRow {
  legal_name: string | null;
  document: string | null;
  document_type: "cnpj" | "cpf" | null;
  bank_code: string | null;
  branch_number: string | null;
  branch_check_digit: string | null;
  account_number: string | null;
  account_check_digit: string | null;
  account_type: "checking" | "savings" | null;
  holder_name: string | null;
  holder_document: string | null;
  kyc_details: RecipientKyc | null;
}

export function accountToRecipientInput(
  companyId: string,
  account: PayoutAccountRow,
  email: string | null,
): RecipientInput {
  return {
    externalCode: companyId,
    legalName: account.legal_name,
    document: account.document,
    documentType: account.document_type,
    email: account.kyc_details?.email ?? email,
    bank: {
      code: account.bank_code,
      branchNumber: account.branch_number,
      branchCheckDigit: account.branch_check_digit,
      accountNumber: account.account_number,
      accountCheckDigit: account.account_check_digit,
      type: account.account_type,
    },
    holderName: account.holder_name,
    holderDocument: account.holder_document,
    kyc: account.kyc_details ?? null,
  };
}

/** Mantém só os últimos `keep` dígitos visíveis. */
export function maskTail(value: unknown, keep = 4): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length <= keep) return "*".repeat(value.length);
  return "*".repeat(value.length - keep) + value.slice(-keep);
}

/**
 * Redige o corpo enviado ao gateway para gravar no log de eventos sem expor dados sensíveis
 * (documentos e número de conta). Não é o segredo da API (esse nunca vai no corpo), mas evita
 * duplicar PII em claro no log.
 */
export function redactRecipientBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  const reg = clone.register_information as Record<string, unknown> | undefined;
  if (reg && typeof reg.document === "string") reg.document = maskTail(reg.document);
  const bank = clone.default_bank_account as Record<string, unknown> | undefined;
  if (bank) {
    if (typeof bank.holder_document === "string") bank.holder_document = maskTail(bank.holder_document);
    if (typeof bank.account_number === "string") bank.account_number = maskTail(bank.account_number);
  }
  return clone;
}
