// Cupom por campanha — lê `?cupom=` / `?coupon=` da URL, normaliza e persiste na sessão até o
// checkout (sobrevive ao round-trip de login). Espelha o padrão do utm.ts. O código é
// case-insensitive (UPPER); o desconto é sempre re-validado no servidor por unidade
// (validate_coupon_public) — nada de regra/limite no front.

const STORAGE_KEY = "mp_coupon";

/** Normaliza o código do cupom: trim + UPPERCASE. Retorna null se vazio. */
export function normalizeCouponCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return v || null;
}

/** Lê o cupom de campanha da query string (aceita `cupom` ou `coupon`; `cupom` tem precedência). */
export function parseCouponParam(search: string): string | null {
  const p = new URLSearchParams(search);
  return normalizeCouponCode(p.get("cupom") ?? p.get("coupon"));
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null; // SSR / storage bloqueado
  }
}

/** Se a URL trouxer cupom, persiste (last-touch). No-op sem cupom ou sem storage. */
export function captureCouponFromSearch(search: string): void {
  const code = parseCouponParam(search);
  if (!code) return;
  safeSession()?.setItem(STORAGE_KEY, code);
}

/** Guarda um código aplicado (pra sobreviver à navegação/login). No-op se inválido. */
export function storeCoupon(code: string | null | undefined): void {
  const c = normalizeCouponCode(code);
  if (!c) return;
  safeSession()?.setItem(STORAGE_KEY, c);
}

/** Cupom guardado na sessão (null se não houver). */
export function getStoredCoupon(): string | null {
  return normalizeCouponCode(safeSession()?.getItem(STORAGE_KEY) ?? null);
}

/** Limpa o cupom guardado (ao remover explicitamente). */
export function clearStoredCoupon(): void {
  safeSession()?.removeItem(STORAGE_KEY);
}
