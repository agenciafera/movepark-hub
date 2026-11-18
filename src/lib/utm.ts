// Captura de UTM (E2.4.1) e prova da origem da venda (E0.3.12).
//
// Último clique: ao chegar numa URL com utm_*, guarda o UTM, a hora do clique, a página de
// entrada e o site de onde veio. Na criação da reserva o ReservationCard manda tudo junto, e o
// servidor decide a comissão pela regra que casar (docs/specs/comissao-por-origem.md).
//
// Site de origem (18/11/2026): a regra também reconhece o domínio de onde o cliente veio, com ou
// sem UTM. Esse domínio é o Referer da navegação que trouxe o cliente, que o navegador expõe em
// `document.referrer` (com a política padrão, só a origem: `https://pareseguro.com/`). Chegada
// SEM UTM vinda de outro site fica numa lista à parte (`mp_ref`), e não sobrescreve o clique com
// UTM: quem decide se ela vale é o servidor, que só a usa quando o domínio está numa regra. Assim
// uma visita vinda da busca do Google não apaga o clique no link do parceiro.
//
// Mora em localStorage, e não na sessão, porque a janela de atribuição é de dias: quem clicou no
// link do estacionamento ontem e reservou hoje ainda é venda dele. Quem decide a janela é o
// SERVIDOR (`app_setting.commission_attribution_window_days`); aqui só se descarta o que passou de
// `MAX_AGE_DAYS`, para uma janela maior no futuro não morrer no navegador.

import { SITE_URL } from "@/lib/site";

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
  /** Origem + caminho do site de onde veio, sem query. Nulo quando veio do próprio site ou do login. */
  referrer: string | null;
};

/** Chegada sem UTM vinda de outro site. */
export type Referral = {
  /** Origem + caminho de onde veio, sem query. */
  referrer: string;
  /** ISO de quando chegou. */
  arrived_at: string;
  /** Caminho de entrada, sem query. */
  landing_url: string | null;
};

const STORAGE_KEY = "mp_utm";
const REFERRALS_KEY = "mp_ref";
export const MAX_AGE_DAYS = 30;
/** Quantas chegadas guardar. A Edge confere o mesmo número (`MAX_CHEGADAS`). */
export const MAX_REFERRALS = 5;
const EMPTY: Utm = { utm_source: null, utm_medium: null, utm_campaign: null };

/**
 * Hosts que aparecem como referrer na VOLTA de um fluxo do próprio site (login com Google, retorno
 * do Supabase Auth, pagamento), e não como origem do cliente. Sem este filtro, quem entrou pelo link
 * do parceiro e fez login com Google ficava com `accounts.google.com` como prova da origem.
 */
const FLOW_HOSTS = ["accounts.google.com", "supabase.co", "pagar.me"];

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

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function matchesHost(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

const SITE_HOST = (hostOf(SITE_URL) ?? "").replace(/^www\./, "");

export type ReferrerKind = "external" | "internal" | "none";

/**
 * Classifica o referrer de uma chegada: `external` é outro site (vale como origem), `internal` é o
 * próprio site ou a volta de um fluxo dele (login, pagamento), `none` é sem referrer.
 */
export function classifyReferrer(
  raw: string | null | undefined,
  ownHost: string | null = typeof location !== "undefined" ? location.hostname : null,
): { kind: ReferrerKind; referrer: string | null } {
  const clean = cleanReferrer(raw);
  const host = hostOf(clean);
  if (!clean || !host || !/^https?:/i.test(clean)) return { kind: "none", referrer: null };
  const own = (ownHost ?? "").toLowerCase();
  if ((own && host === own) || (SITE_HOST && matchesHost(host, SITE_HOST))) {
    return { kind: "internal", referrer: null };
  }
  if (FLOW_HOSTS.some((h) => matchesHost(host, h))) return { kind: "internal", referrer: null };
  return { kind: "external", referrer: clean };
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
 * O `document.referrer` vale só para a primeira captura de cada carregamento de página: nas
 * navegações seguintes (SPA) ele continua apontando para o site de antes, e uma busca nova dentro
 * do Hub não pode virar "chegada do parceiro" de novo.
 */
let documentReferrerRead = false;

function arrivalReferrer(ctx: { referrer?: string | null }): string | null {
  if (ctx.referrer !== undefined) return ctx.referrer;
  if (documentReferrerRead || typeof document === "undefined") return null;
  documentReferrerRead = true;
  return document.referrer || null;
}

function sameUtm(a: Utm, b: Utm): boolean {
  return a.utm_source === b.utm_source && a.utm_medium === b.utm_medium && a.utm_campaign === b.utm_campaign;
}

function write(key: string, value: unknown): void {
  try {
    safeStorage()?.setItem(key, JSON.stringify(value));
  } catch {
    // cota cheia ou storage somente leitura: a reserva segue sem atribuição
  }
}

function remove(key: string): void {
  try {
    safeStorage()?.removeItem(key);
  } catch {
    // storage bloqueado
  }
}

/**
 * Registra a chegada. Com UTM, é um clique: persiste (o último clique sobrescreve) e descarta as
 * chegadas sem UTM de antes dele. Sem UTM e vindo de outro site, entra na lista de chegadas, sem
 * mexer no clique guardado. `now`, `pathname` e `referrer` entram por parâmetro para o teste não
 * depender do relógio nem do documento.
 */
export function captureAttribution(
  search: string,
  ctx: { now?: Date; pathname?: string | null; referrer?: string | null } = {},
): void {
  const now = ctx.now ?? new Date();
  const pathname =
    ctx.pathname !== undefined ? ctx.pathname : typeof window !== "undefined" ? window.location.pathname : null;
  const ref = classifyReferrer(arrivalReferrer(ctx));
  const utm = parseUtm(search);

  if (utm) {
    const stored = getStoredAttribution(now);
    const repeat = !!stored && sameUtm(stored, utm);
    // O mesmo link voltando do login, ou de uma página do próprio site: não é clique novo.
    if (repeat && ref.kind === "internal") return;
    const record: Attribution = {
      ...utm,
      clicked_at: now.toISOString(),
      landing_url: landingUrl(pathname, utm),
      // O mesmo link aberto de novo sem dizer de onde (app que esconde o referrer): fica o site
      // da primeira vez. Clique em outro link sem referrer: nenhum.
      referrer: ref.referrer ?? (repeat && ref.kind === "none" ? (stored?.referrer ?? null) : null),
    };
    write(STORAGE_KEY, record);
    remove(REFERRALS_KEY);
    return;
  }

  if (ref.kind !== "external" || !ref.referrer) return;
  const host = hostOf(ref.referrer);
  const others = getStoredReferrals(now).filter((r) => hostOf(r.referrer) !== host);
  const arrival: Referral = { referrer: ref.referrer, arrived_at: now.toISOString(), landing_url: pathname || null };
  write(REFERRALS_KEY, [arrival, ...others].slice(0, MAX_REFERRALS));
}

/** Só para teste: volta a ler o `document.referrer` como se a página tivesse acabado de carregar. */
export function resetArrivalForTest(): void {
  documentReferrerRead = false;
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

/** Chegadas sem UTM guardadas, a mais nova primeiro, só as dentro de `MAX_AGE_DAYS`. */
export function getStoredReferrals(now: Date = new Date()): Referral[] {
  const raw = safeStorage()?.getItem(REFERRALS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Referral[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const r = item as Partial<Referral>;
      const at = typeof r.arrived_at === "string" ? new Date(r.arrived_at) : null;
      if (typeof r.referrer !== "string" || !/^https?:\/\//i.test(r.referrer)) continue;
      if (!at || Number.isNaN(at.getTime())) continue;
      if (now.getTime() - at.getTime() > MAX_AGE_DAYS * 86_400_000) continue;
      out.push({
        referrer: r.referrer,
        arrived_at: at.toISOString(),
        landing_url: typeof r.landing_url === "string" ? r.landing_url : null,
      });
    }
    return out.sort((a, b) => b.arrived_at.localeCompare(a.arrived_at)).slice(0, MAX_REFERRALS);
  } catch {
    return [];
  }
}

/** UTMs guardados (todos null se não houver). */
export function getStoredUtm(now: Date = new Date()): Utm {
  const a = getStoredAttribution(now);
  if (!a) return { ...EMPTY };
  return { utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign };
}

export type BookingAttribution = {
  clicked_at: string | null;
  landing_url: string | null;
  referrer: string | null;
  /** Só vai quando há chegada sem UTM vinda de outro site. */
  referrals?: Referral[];
};

/** O que vai no corpo do `create-booking`: os utm_* soltos (E2.4.1) e a prova da origem junto. */
export function bookingAttributionPayload(now: Date = new Date()): Utm & { attribution: BookingAttribution | null } {
  const a = getStoredAttribution(now);
  const referrals = getStoredReferrals(now);
  if (!a && referrals.length === 0) return { ...EMPTY, attribution: null };
  return {
    utm_source: a?.utm_source ?? null,
    utm_medium: a?.utm_medium ?? null,
    utm_campaign: a?.utm_campaign ?? null,
    attribution: {
      clicked_at: a?.clicked_at ?? null,
      landing_url: a?.landing_url ?? null,
      referrer: a?.referrer ?? null,
      ...(referrals.length > 0 ? { referrals } : {}),
    },
  };
}
