/** Máscara display BR: (11) 91234-5678 */
export function maskPhoneBR(raw: string): string {
  const v = raw.replace(/\D/g, "").slice(0, 11);
  if (v.length <= 2) return v.length ? `(${v}` : "";
  if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length <= 10)
    return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
}

/** Normaliza pra E.164 BR: +5511912345678. Retorna null se inválido. */
export function toE164BR(raw: string): string | null {
  const v = raw.replace(/\D/g, "");
  if (v.length < 10 || v.length > 11) return null;
  return `+55${v}`;
}
