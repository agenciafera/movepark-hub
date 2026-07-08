import { parsePhoneNumber } from "react-phone-number-input";

// ADR-006: identificadores (e-mail/telefone) são a credencial. Normalização única e testável:
// e-mail em lowercase, telefone em E.164. Usado no login e nos fluxos de anexar/merge (E0.10).

type DefaultCountry = Parameters<typeof parsePhoneNumber>[1];

/** Normaliza e-mail: trim + lowercase. Retorna null se vazio ou claramente inválido. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  // Validação leve (algo@algo.tld) — a verificação de verdade é o OTP/magic-link.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

/**
 * Normaliza telefone para **E.164** (`+55...`). Retorna null se inválido. `defaultCountry` resolve
 * números digitados sem DDI (o `PhoneField` já entrega E.164, mas o servidor/merge não confia nisso).
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  defaultCountry: DefaultCountry = "BR" as DefaultCountry,
): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const parsed = parsePhoneNumber(v, defaultCountry);
    if (!parsed || !parsed.isValid()) return null;
    return parsed.number; // formato E.164
  } catch {
    return null;
  }
}
