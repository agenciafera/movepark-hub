// Handoff de checkout (reserva por agente): o link traz o segredo no fragment (#ht=<segredo>).
// Lógica pura de extração e limpeza da URL, testável sem browser. Ver agent-booking.md §6.

/** Extrai o segredo do handoff de um hash de URL (`#ht=abc`). null se ausente. */
export function parseHandoffToken(hash: string): string | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  const t = params.get("ht");
  return t && t.trim() ? t.trim() : null;
}

/** true quando o link pediu para cair no pagamento (?pay=1). */
export function wantsPayStep(search: string): boolean {
  return new URLSearchParams(search).get("pay") === "1";
}
