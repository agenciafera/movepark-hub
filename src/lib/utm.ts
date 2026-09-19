// Captura de UTM (E2.4.1) e prova da origem da venda (E0.3.12).
//
// Último clique: ao chegar numa URL com utm_*, guarda o UTM, a hora do clique, a página de
// entrada e o referrer. Na criação da reserva o ReservationCard manda tudo junto, e o servidor
// decide a comissão pela regra que casar (docs/specs/comissao-por-origem.md).
//
// Mora em localStorage, e não na sessão, porque a janela de atribuição é de dias: quem clicou no
// link do estacionamento ontem e reservou hoje ainda é venda dele. Quem decide a janela é o
// SERVIDOR (`app_setting.commission_attribution_window_days`); aqui só se descarta o que passou de
// `MAX_AGE_DAYS`, para uma janela maior no futuro não morrer no navegador.

export type Utm = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export type Attribution = Utm & {
  /** ISO de quando o cliente chegou pelo link. */
  clicked_at: string;
  /** Caminho de entrada com os utm_* (sem os outros parâmetros, que podem ter dado pessoal). */
  landing_url: string | null;
  /** Origem + caminho de onde veio, sem query. */
  referrer: string | null;
};

const STORAGE_KEY = "mp_utm";
export const MAX_AGE_DAYS = 30;
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

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // storage bloqueado: cai para a sessão
  }
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null; // SSR / storage bloqueado
  }
}

/** Referrer sem query nem hash: o endereço basta como prova, e a query pode ter dado pessoal. */
export function cleanReferrer(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

/** Página de entrada só com os utm_*. */
export function landingUrl(pathname: string | null | undefined, utm: Utm): string | null {
  if (!pathname) return null;
  const q = new URLSearchParams();
  if (utm.utm_source) q.set("utm_source", utm.utm_source);
  if (utm.utm_medium) q.set("utm_medium", utm.utm_medium);
  if (utm.utm_campaign) q.set("utm_campaign", utm.utm_campaign);
  const qs = q.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Se a URL trouxer UTMs, persiste (o último clique sobrescreve). No-op sem UTM ou sem storage.
 * `now`, `pathname` e `referrer` entram por parâmetro para o teste não depender do relógio.
 */
export function captureUtmFromSearch(
  search: string,
  ctx: { now?: Date; pathname?: string | null; referrer?: string | null } = {},
): void {
  const utm = parseUtm(search);
  if (!utm) return;
  const pathname =
    ctx.pathname !== undefined ? ctx.pathname : typeof window !== "undefined" ? window.location.pathname : null;
  const referrer =
    ctx.referrer !== undefined ? ctx.referrer : typeof document !== "undefined" ? document.referrer : null;
  const record: Attribution = {
    ...utm,
    clicked_at: (ctx.now ?? new Date()).toISOString(),
    landing_url: landingUrl(pathname, utm),
    referrer: cleanReferrer(referrer),
  };
  try {
    safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // cota cheia ou storage somente leitura: a reserva segue sem atribuição
  }
}

/** A prova guardada, ou null quando não há, está ilegível ou passou de `MAX_AGE_DAYS`. */
export function getStoredAttribution(now: Date = new Date()): Attribution | null {
  const storage = safeStorage();
  const raw = storage?.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Attribution>;
    const utm: Utm = {
      utm_source: parsed.utm_source ?? null,
      utm_medium: parsed.utm_medium ?? null,
      utm_campaign: parsed.utm_campaign ?? null,
    };
    if (!utm.utm_source && !utm.utm_medium && !utm.utm_campaign) return null;
    const clicked = parsed.clicked_at ? new Date(parsed.clicked_at) : null;
    // Registro antigo (só utm_*, sem data) ou data ilegível: não dá para provar quando foi.
    if (!clicked || Number.isNaN(clicked.getTime())) return null;
    if (now.getTime() - clicked.getTime() > MAX_AGE_DAYS * 86_400_000) {
      storage?.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      ...utm,
      clicked_at: clicked.toISOString(),
      landing_url: parsed.landing_url ?? null,
      referrer: parsed.referrer ?? null,
    };
  } catch {
    return null;
  }
}

/** UTMs guardados (todos null se não houver). */
export function getStoredUtm(now: Date = new Date()): Utm {
  const a = getStoredAttribution(now);
  if (!a) return { ...EMPTY };
  return { utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign };
}

/** O que vai no corpo do `create-booking`: os utm_* soltos (E2.4.1) e a prova da origem junto. */
export function bookingAttributionPayload(now: Date = new Date()): Utm & {
  attribution: { clicked_at: string; landing_url: string | null; referrer: string | null } | null;
} {
  const a = getStoredAttribution(now);
  if (!a) return { ...EMPTY, attribution: null };
  return {
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    attribution: { clicked_at: a.clicked_at, landing_url: a.landing_url, referrer: a.referrer },
  };
}
