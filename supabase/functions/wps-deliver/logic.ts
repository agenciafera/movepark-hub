// Lógica pura da entrega outbound do WPS (E2.6.1) — testável sem rede.

/** Segundos até a próxima tentativa (backoff exponencial a partir de 2min, teto 4h). */
export function nextBackoff(attempts: number): number {
  const base = 120 * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(base, 4 * 3600);
}

/** 2xx = entregue; o resto = retry. */
export function classifyResult(status: number): "delivered" | "retry" {
  return status >= 200 && status < 300 ? "delivered" : "retry";
}

/** Assinatura HMAC-SHA256 (hex) do corpo, com o segredo do parceiro. */
export async function signPayload(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
