// Documento do cliente (CPF/CNPJ) para cobranças no gateway. Edge (Deno).
// O dígito verificador é validado no front (src/lib/documents.ts); aqui a checagem
// é por comprimento, espelhando o que o gateway exige.

import type { ChargeCustomer } from "./types.ts";

/** Só os dígitos do documento. */
export function documentDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Aceita CPF (11 dígitos) ou CNPJ (14). */
export function isValidChargeDocument(value: string | null | undefined): boolean {
  const len = documentDigits(value).length;
  return len === 11 || len === 14;
}

/** Tipo do customer no gateway: CNPJ → company; senão individual (CPF). */
export function customerTypeFor(value: string | null | undefined): ChargeCustomer["type"] {
  return documentDigits(value).length === 14 ? "company" : "individual";
}
