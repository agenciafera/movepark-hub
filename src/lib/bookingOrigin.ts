// Origem da reserva (E2.1.1) — de onde a venda nasceu, pra medir a migração white-label → hub.
//
// O sinal forte "externo (API/white-label) vs hub" já é `booking.created_via_api_key_id`
// (NOT NULL = criada via Public API). Aqui detalhamos a SUB-FONTE dentro do hub, pra otimizar funil.
// Medição hub × white-label (na E2.4): `created_via_api_key_id IS NULL` E `origin LIKE 'hub%'`.

export const BOOKING_ORIGIN = {
  HUB_SEARCH: "hub_search",
  HUB_DESTINO: "hub_destino",
  HUB_DIRECT: "hub_direct",
  WHITE_LABEL: "white_label",
  API: "api",
} as const;

export type BookingOrigin = (typeof BOOKING_ORIGIN)[keyof typeof BOOKING_ORIGIN];

/** Fonte de entrada (`?src=…` na URL da listagem) → origem da reserva. Default: entrada direta. */
export function originFromSrc(src: string | null | undefined): BookingOrigin {
  if (src === "search") return BOOKING_ORIGIN.HUB_SEARCH;
  if (src === "destino") return BOOKING_ORIGIN.HUB_DESTINO;
  return BOOKING_ORIGIN.HUB_DIRECT;
}

/** Reserva originada no próprio hub (consumo direto), não via API/white-label. */
export function isHubOrigin(origin: string | null | undefined): boolean {
  return !!origin && origin.startsWith("hub");
}

/**
 * Rótulo humano da origem (02/10/2026). A coluna `booking.origin` mistura fontes do site
 * (`hub_*`), o white-label, a API de parceiro e os agentes (`mcp` = Mia pelo MCP do cliente,
 * `whatsapp-bot` = Mia no WhatsApp, `webchat-bot` = assistente do site). Valor desconhecido
 * aparece como veio, para não esconder dado.
 */
export function bookingOriginLabel(origin: string | null | undefined): string {
  switch (origin) {
    case "hub_search":
      return "Site Movepark, pela busca";
    case "hub_destino":
      return "Site Movepark, pela página do destino";
    case "hub_direct":
      return "Site Movepark, por link direto";
    case "white_label":
      return "Site white-label do estacionamento";
    case "api":
      return "API de parceiro";
    case "mcp":
      return "Mia (agente) pelo MCP";
    case "whatsapp-bot":
      return "Mia no WhatsApp";
    case "webchat-bot":
      return "Assistente do site (webchat)";
    case null:
    case undefined:
    case "":
      return "Origem não registrada";
    default:
      return origin;
  }
}

export type AttributionEntry = { label: string; value: string };

const ATTR_LABELS: Record<string, string> = {
  origin: "Origem registrada no clique",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_term: "utm_term",
  utm_content: "utm_content",
  clicked_at: "Chegou pelo link em",
  landing_url: "Página de entrada",
  referrer: "Veio de",
};

/**
 * Tudo que a reserva guarda sobre de onde veio, em pares legíveis: os UTMs da própria linha, o
 * `attribution` (jsonb do clique, com página de entrada e referrer) e a chave de API, se houver.
 * Chaves que não conhecemos entram com o próprio nome, para nada ficar escondido.
 */
export function attributionEntries(
  b: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    attribution?: unknown;
    created_via_api_key_id?: string | null;
  },
  formatDateTime: (iso: string) => string,
): AttributionEntry[] {
  const out: AttributionEntry[] = [];
  const seen = new Set<string>();
  const push = (key: string, raw: unknown) => {
    if (raw == null || raw === "" || seen.has(key)) return;
    const value = key === "clicked_at" && typeof raw === "string" ? formatDateTime(raw) : String(raw);
    seen.add(key);
    out.push({ label: ATTR_LABELS[key] ?? key, value });
  };
  const a = (b.attribution && typeof b.attribution === "object" ? b.attribution : {}) as Record<string, unknown>;
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) push(k, a[k] ?? (b as Record<string, unknown>)[k]);
  for (const k of ["clicked_at", "landing_url", "referrer", "origin"]) push(k, a[k]);
  for (const k of Object.keys(a)) push(k, a[k]);
  if (b.created_via_api_key_id) out.push({ label: "Chave de API", value: b.created_via_api_key_id });
  return out;
}

/** O resumo curto que cabe numa linha: só utm_source, utm_medium e utm_campaign, quando houver. */
export function attributionChips(b: { utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; attribution?: unknown }): string[] {
  const a = (b.attribution && typeof b.attribution === "object" ? b.attribution : {}) as Record<string, unknown>;
  const v = (k: string) => {
    const x = a[k] ?? (b as Record<string, unknown>)[k];
    return typeof x === "string" && x.trim() ? x.trim() : null;
  };
  return (["utm_source", "utm_medium", "utm_campaign"] as const)
    .map((k) => (v(k) ? `${k.replace("utm_", "")}: ${v(k)}` : null))
    .filter((x): x is string => !!x);
}
