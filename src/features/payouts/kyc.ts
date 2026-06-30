// Schema e mapeamentos do KYC do recebedor (PJ / corporation), conforme o que o Pagar.me exige
// em register_information + default_bank_account (ver docs/specs/payment-split.md). Fonte ÚNICA de
// validação, reutilizada pelo passo do wizard (operador) e pelo formulário do Manager (hub_admin).
//
// Convenções:
//  - Documentos/CEP/telefone são guardados em DÍGITOS (sem máscara) no payload.
//  - Dinheiro em REAIS (CurrencyInput emite reais); no payload/gateway vai como inteiro de reais.
//  - Telefone do form é uma string mascarada; vira { ddd, number } no payload.

import { z } from "zod";
import { isValidCnpj, isValidCpf, isValidPastDateBR, isValidPhoneBR } from "@/lib/documents";
import { cepMask, cnpjMask, cpfMask, dateMask, onlyDigits, phoneMask, splitPhone } from "@/lib/masks";

export const CORPORATION_TYPES = ["MEI", "EI", "EIRELI", "SLU", "LTDA", "SA", "OUTROS"] as const;

const requiredText = (msg: string) => z.string().trim().min(1, msg);

const addressSchema = z.object({
  zip_code: z.string().refine((v) => onlyDigits(v).length === 8, "CEP inválido"),
  street: requiredText("Informe a rua"),
  street_number: requiredText("Informe o número"),
  // Pagar.me exige complemento e ponto de referência no recebedor — obrigatórios no form.
  complement: requiredText("Informe o complemento"),
  neighborhood: requiredText("Informe o bairro"),
  city: requiredText("Informe a cidade"),
  state: z.string().trim().length(2, "UF"),
  reference_point: requiredText("Informe um ponto de referência"),
});
export type KycAddress = z.infer<typeof addressSchema>;

// Dinheiro em REAIS (CurrencyInput emite reais). Pagar.me espera inteiro em reais.
const moneyReais = (msg: string) =>
  z
    .number({ invalid_type_error: msg, required_error: msg })
    .positive(msg);

const phoneField = z.string().refine(isValidPhoneBR, "Telefone inválido (com DDD)");

const companySchema = z.object({
  legal_name: requiredText("Informe a razão social"),
  trade_name: z.string().trim().optional().default(""),
  document: z.string().refine(isValidCnpj, "CNPJ inválido"),
  email: z.string().trim().email("E-mail inválido"),
  annual_revenue: moneyReais("Informe o faturamento anual"),
  founding_date: z.string().refine(isValidPastDateBR, "Data de fundação inválida"),
  corporation_type: z.enum(CORPORATION_TYPES, {
    errorMap: () => ({ message: "Selecione o tipo de empresa" }),
  }),
  phone: phoneField,
  address: addressSchema,
});

const representativeSchema = z.object({
  name: requiredText("Informe o nome do representante"),
  document: z.string().refine(isValidCpf, "CPF inválido"),
  email: z.string().trim().email("E-mail inválido"),
  birthdate: z.string().refine(isValidPastDateBR, "Data de nascimento inválida"),
  monthly_income: moneyReais("Informe a renda mensal"),
  professional_occupation: requiredText("Informe a ocupação"),
  mother_name: z.string().trim().optional().default(""),
  self_declared_legal_representative: z
    .boolean()
    .refine((v) => v === true, "Confirme que é o representante legal"),
  phone: phoneField,
  address: addressSchema,
});

const bankSchema = z.object({
  bank_code: z.string().refine((v) => onlyDigits(v).length >= 3, "Código do banco"),
  branch_number: requiredText("Informe a agência"),
  branch_check_digit: z.string().trim().optional().default(""),
  account_number: requiredText("Informe a conta"),
  account_check_digit: requiredText("Dígito"),
  account_type: z.enum(["checking", "savings"], {
    errorMap: () => ({ message: "Selecione o tipo de conta" }),
  }),
  // Pagar.me limita o titular da conta a 30 caracteres.
  holder_name: requiredText("Informe o titular").max(30, "O titular deve ter no máximo 30 caracteres"),
});

export const payoutKycSchema = z.object({
  company: companySchema,
  representative: representativeSchema,
  bank: bankSchema,
});

export type PayoutKycForm = z.infer<typeof payoutKycSchema>;

// ── Defaults / pré-preenchimento ────────────────────────────────────────────
export function emptyAddress(): KycAddress {
  return {
    zip_code: "",
    street: "",
    street_number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    reference_point: "",
  };
}

export function emptyPayoutKyc(prefill?: {
  legalName?: string | null;
  document?: string | null;
}): PayoutKycForm {
  return {
    company: {
      legal_name: prefill?.legalName ?? "",
      trade_name: "",
      document: prefill?.document ?? "",
      email: "",
      annual_revenue: null as unknown as number,
      founding_date: "",
      corporation_type: "LTDA",
      phone: "",
      address: emptyAddress(),
    },
    representative: {
      name: "",
      document: "",
      email: "",
      birthdate: "",
      monthly_income: null as unknown as number,
      professional_occupation: "",
      mother_name: "",
      self_declared_legal_representative: false,
      phone: "",
      address: emptyAddress(),
    },
    bank: {
      bank_code: "",
      branch_number: "",
      branch_check_digit: "",
      account_number: "",
      account_check_digit: "",
      account_type: "checking",
      holder_name: "",
    },
  };
}

// ── Reverso: linha de company_payout_account → defaults do form (para edição) ─
type JsonObj = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

function addressFromJson(a: unknown): KycAddress {
  const o = (a ?? {}) as JsonObj;
  return {
    zip_code: cepMask(str(o.zip_code)),
    street: str(o.street),
    street_number: str(o.street_number),
    complement: str(o.complement),
    neighborhood: str(o.neighborhood),
    city: str(o.city),
    state: str(o.state),
    reference_point: str(o.reference_point),
  };
}

function phoneFromJson(p: unknown): string {
  const o = (p ?? {}) as JsonObj;
  return phoneMask(`${str(o.ddd)}${str(o.number)}`);
}

/** Linha de company_payout_account (colunas planas + kyc_details) → form (com máscaras). */
export function payoutAccountToForm(
  row: {
    legal_name: string | null;
    document: string | null;
    bank_code: string | null;
    branch_number: string | null;
    branch_check_digit: string | null;
    account_number: string | null;
    account_check_digit: string | null;
    account_type: string | null;
    holder_name: string | null;
    kyc_details: unknown;
  } | null,
  prefill?: { legalName?: string | null; document?: string | null },
): PayoutKycForm {
  if (!row) return emptyPayoutKyc(prefill);
  const k = (row.kyc_details ?? {}) as JsonObj;
  const rep = (k.representative ?? {}) as JsonObj;
  const base = emptyPayoutKyc(prefill);
  return {
    company: {
      legal_name: row.legal_name ?? prefill?.legalName ?? "",
      trade_name: str(k.trade_name),
      document: cnpjMask(row.document ?? prefill?.document ?? ""),
      email: str(k.email),
      annual_revenue: num(k.annual_revenue) as unknown as number,
      founding_date: dateMask(onlyDigits(str(k.founding_date))),
      corporation_type: (CORPORATION_TYPES as readonly string[]).includes(str(k.corporation_type))
        ? (str(k.corporation_type) as (typeof CORPORATION_TYPES)[number])
        : "LTDA",
      phone: phoneFromJson(k.phone),
      address: addressFromJson(k.address),
    },
    representative: {
      name: str(rep.name),
      document: cpfMask(str(rep.document)),
      email: str(rep.email),
      birthdate: dateMask(onlyDigits(str(rep.birthdate))),
      monthly_income: num(rep.monthly_income) as unknown as number,
      professional_occupation: str(rep.professional_occupation),
      mother_name: str(rep.mother_name),
      self_declared_legal_representative: rep.self_declared_legal_representative === true,
      phone: phoneFromJson(rep.phone),
      address: addressFromJson(rep.address),
    },
    bank: {
      bank_code: row.bank_code ?? "",
      branch_number: row.branch_number ?? "",
      branch_check_digit: row.branch_check_digit ?? "",
      account_number: row.account_number ?? "",
      account_check_digit: row.account_check_digit ?? "",
      account_type: row.account_type === "savings" ? "savings" : "checking",
      holder_name: row.holder_name ?? base.bank.holder_name,
    },
  };
}

function addressToJson(a: KycAddress) {
  return {
    zip_code: onlyDigits(a.zip_code),
    street: a.street.trim(),
    street_number: a.street_number.trim(),
    complement: a.complement?.trim() || null,
    neighborhood: a.neighborhood.trim(),
    city: a.city.trim(),
    state: a.state.trim().toUpperCase(),
    reference_point: a.reference_point?.trim() || null,
  };
}

/**
 * Converte o form validado no payload do RPC/upsert: colunas planas de banco/identidade +
 * `kyc_details` (jsonb) com o restante do register_information. Dinheiro vai em REAIS.
 */
export function toPayoutAccountPayload(form: PayoutKycForm) {
  const c = form.company;
  const r = form.representative;
  const b = form.bank;
  const document = onlyDigits(c.document);
  return {
    legal_name: c.legal_name.trim(),
    document,
    document_type: "cnpj" as const,
    bank_code: onlyDigits(b.bank_code),
    branch_number: b.branch_number.trim(),
    branch_check_digit: b.branch_check_digit?.trim() || null,
    account_number: b.account_number.trim(),
    account_check_digit: b.account_check_digit.trim(),
    account_type: b.account_type,
    holder_name: b.holder_name.trim(),
    holder_document: document, // PJ: titular = CNPJ da empresa
    kyc_details: {
      email: c.email.trim(),
      trade_name: c.trade_name?.trim() || null,
      annual_revenue: Math.round(c.annual_revenue),
      founding_date: c.founding_date, // DD/MM/AAAA → o adapter converte p/ ISO se preciso
      corporation_type: c.corporation_type,
      phone: splitPhone(c.phone),
      address: addressToJson(c.address),
      representative: {
        name: r.name.trim(),
        document: onlyDigits(r.document),
        email: r.email.trim(),
        birthdate: r.birthdate,
        monthly_income: Math.round(r.monthly_income),
        professional_occupation: r.professional_occupation.trim(),
        mother_name: r.mother_name?.trim() || null,
        self_declared_legal_representative: r.self_declared_legal_representative,
        phone: splitPhone(r.phone),
        address: addressToJson(r.address),
      },
    },
  };
}
