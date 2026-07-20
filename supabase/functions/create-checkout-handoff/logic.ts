// Lógica pura do handoff de checkout: geração do segredo e hash. Testável sem rede.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Segredo opaco de alta entropia (base62) + prefixo indexável (16 chars). */
export function makeToken(): { secret: string; prefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let secret = "";
  for (const b of bytes) secret += ALPHABET[b % ALPHABET.length];
  return { secret, prefix: secret.slice(0, 16) };
}

/** sha256 hex (casa com o token_hash guardado; comparação server-side). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Prefixo derivado de um segredo já existente (lookup no resgate). */
export function prefixOf(secret: string): string {
  return secret.slice(0, 16);
}
