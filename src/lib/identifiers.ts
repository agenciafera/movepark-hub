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

/**
 * Recupera um telefone ARMAZENADO para o **E.164 canônico** (com "+"). Par simétrico de
 * `normalizePhoneE164` (que é a regra de **gravação**). Motivo: o Supabase guarda
 * `auth.users.phone` **sem** o "+" (ex.: `"5511987727182"`), e o mesmo pode vir de outros snapshots.
 * A UI (`react-phone-number-input`) e o E.164 canônico exigem o "+", senão o país (bandeira) não é
 * reconhecido. REGRA ÚNICA de recuperação: todo lugar que lê telefone do banco/sessão passa por aqui
 * antes de exibir ou comparar. Não revalida (o número já foi validado na gravação); só garante o "+".
 */
export function storedPhoneToE164(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v.startsWith("+")) return v;
  const digits = v.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}
