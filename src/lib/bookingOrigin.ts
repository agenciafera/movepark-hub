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
