// Os ids do GA4 que o navegador tem e o servidor não: `client_id` (cookie `_ga`) e `session_id`
// (cookie `_ga_<stream>`). Vão no corpo do `create-booking` e ficam na reserva, para o
// `purchase` enviado pelo webhook (Measurement Protocol) cair na mesma sessão que o resto da
// jornada. Ver docs/specs/analytics-ecommerce.md §3.
//
// Puro de propósito: quem lê `document.cookie` é só `gaIdsPayload`, no fim.

/** `_ga=GA1.1.1234567890.1699999999` → `1234567890.1699999999` (os dois últimos segmentos). */
export function parseGaClientId(gaCookie: string | null | undefined): string | null {
  if (!gaCookie) return null;
  const parts = gaCookie.trim().split(".");
  if (parts.length < 4) return null;
  const id = parts.slice(-2).join(".");
  return /^\d{1,20}\.\d{1,20}$/.test(id) ? id : null;
}

/**
 * `_ga_XXXX=GS1.1.1699999999.3.1.1699999999.60.0.0` → `1699999999` (terceiro segmento) e, no
 * formato novo, `GS2.1.s1699999999$o3$g1$t...` → o que vem depois de `s` até o `$`.
 */
export function parseGaSessionId(streamCookie: string | null | undefined): string | null {
  if (!streamCookie) return null;
  const v = streamCookie.trim();
  const novo = /^GS\d+\.\d+\.s(\d{1,20})(\$|$)/.exec(v);
  if (novo) return novo[1];
  const parts = v.split(".");
  if (parts.length < 3 || !/^GS\d+$/.test(parts[0])) return null;
  return /^\d{1,20}$/.test(parts[2]) ? parts[2] : null;
}

/** Quebra `document.cookie` num mapa nome → valor (o último vence, como o navegador faz). */
export function parseCookies(raw: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name) out[name] = part.slice(i + 1).trim();
  }
  return out;
}

export type GaIds = { client_id: string | null; session_id: string | null };

/** Os dois ids a partir de uma string de cookies. Sem `_ga` não há o que mandar. */
export function gaIdsFromCookies(raw: string | null | undefined): GaIds {
  const cookies = parseCookies(raw);
  const client_id = parseGaClientId(cookies["_ga"]);
  const stream = Object.keys(cookies).find((k) => k.startsWith("_ga_"));
  const session_id = client_id && stream ? parseGaSessionId(cookies[stream]) : null;
  return { client_id, session_id };
}

/** O que vai no corpo do `create-booking`. Sem cookie (SSR, opt-out, bloqueador) vai `null`. */
export function gaIdsPayload(): { ga: GaIds | null } {
  try {
    if (typeof document === "undefined") return { ga: null };
    const ids = gaIdsFromCookies(document.cookie);
    return { ga: ids.client_id ? ids : null };
  } catch {
    return { ga: null };
  }
}
