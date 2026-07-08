// Lógica pura da Edge attach-identifier (E0.10). Normalização de identificador, hash e geração de
// código OTP — testáveis sem rede. A orquestração (envio, ownership, attach/merge) mora no index.ts.

export type Channel = "phone" | "email";

export function isChannel(c: unknown): c is Channel {
  return c === "phone" || c === "email";
}

/** Normaliza: e-mail lowercase; telefone → E.164 (`+` + dígitos). null se inválido. */
export function normalizeIdentifier(channel: string, raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  if (channel === "email") {
    const e = v.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
  }
  if (channel === "phone") {
    const digits = v.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  return null;
}

/** sha256(code) em hex — nunca guardamos o código cru. */
export async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Código OTP de 6 dígitos (aleatório criptográfico). */
export function genCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 1_000_000).toString().padStart(6, "0");
}
