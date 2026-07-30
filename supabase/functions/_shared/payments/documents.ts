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

// ── Dígito verificador ───────────────────────────────────────────────────────
//
// Gêmeo de `src/lib/documents.ts` (isValidCpf/isValidCnpj). A duplicação existe porque a Edge roda
// em Deno e não importa de `src/`. Se mudar um lado, mude o outro.
//
// Por que a Edge precisa disto, se o front já valida: quem escreve pela Public API ou pelo MCP
// (agente/chatbot) NÃO passa pelo formulário, então a validação do front não protege esse caminho.
// Sem isto, um CPF inválido é gravado, o assistente responde "pronto, gravado", e o usuário só
// descobre no pagamento. Achado §16-2 de docs/specs/customer/agent-test-scenarios.md.

function cpfCheckDigitsOk(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false; // sequência repetida (111.111.111-11 e afins)
  const calc = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function cnpjCheckDigitsOk(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number): number => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/**
 * CPF ou CNPJ com dígito verificador correto. Mais estrito que `isValidChargeDocument`, que só olha
 * o comprimento: use este na ESCRITA (porta de entrada), para o dado ruim não chegar ao banco.
 * O gate de pagamento segue por comprimento de propósito, para não recusar registro antigo.
 */
export function hasValidCheckDigits(value: string | null | undefined): boolean {
  const d = documentDigits(value);
  if (d.length === 11) return cpfCheckDigitsOk(d);
  if (d.length === 14) return cnpjCheckDigitsOk(d);
  return false;
}
