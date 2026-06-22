// Captura de UTM (E2.4.1) — atribuição de marketing da reserva.
// Last-touch dentro da sessão: ao chegar numa URL com utm_*, guarda em sessionStorage;
// na criação da reserva, o ReservationCard lê e envia junto. As colunas utm_* já existem
// no schema do booking; a origem (hub vs white-label) é a flag da E2.1.1.

export type Utm = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

const STORAGE_KEY = "mp_utm";
const EMPTY: Utm = { utm_source: null, utm_medium: null, utm_campaign: null };

/** Extrai utm_* de uma query string. Retorna null quando nenhum utm está presente. */
export function parseUtm(search: string): Utm | null {
  const p = new URLSearchParams(search);
  const utm: Utm = {
    utm_source: p.get("utm_source"),
    utm_medium: p.get("utm_medium"),
    utm_campaign: p.get("utm_campaign"),
  };
  const hasAny = utm.utm_source || utm.utm_medium || utm.utm_campaign;
  return hasAny ? utm : null;
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null; // SSR / storage bloqueado
  }
}

/** Se a URL trouxer UTMs, persiste (last-touch sobrescreve). No-op sem UTM ou sem storage. */
export function captureUtmFromSearch(search: string): void {
  const utm = parseUtm(search);
  if (!utm) return;
  safeSession()?.setItem(STORAGE_KEY, JSON.stringify(utm));
}

/** UTMs guardados na sessão (todos null se não houver). */
export function getStoredUtm(): Utm {
  const raw = safeSession()?.getItem(STORAGE_KEY);
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Partial<Utm>;
    return {
      utm_source: parsed.utm_source ?? null,
      utm_medium: parsed.utm_medium ?? null,
      utm_campaign: parsed.utm_campaign ?? null,
    };
  } catch {
    return { ...EMPTY };
  }
}
