/**
 * Lógica pura do mapa do Google (Maps Embed API). Fica separada do componente porque a montagem
 * da URL é o que tem regra: qual identificador do lugar ganha, como escapar e quando não há mapa.
 *
 * Por que a **Embed API** e não a Maps JavaScript API: as páginas que usam isso (destino e detalhe
 * da unidade) são públicas, pré-renderizadas e de tráfego alto. A Embed API é gratuita e sem teto,
 * não entra no bundle e o iframe carrega lazy. A JS API continua sendo a certa no painel do
 * operador (`LocationMapPreview`), onde o mapa é interativo e o volume é baixo.
 */

export type MapEmbedTarget = {
  /** Place ID do Google. Ganha de todos: é o pin exato, com o nome do lugar no mapa. */
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

/** Só aceita coordenada que dá para plotar (o banco tem `numeric`, que chega como string ou null). */
function asFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve o `q` da Embed API na ordem de precisão: Place ID, coordenada, endereço.
 * Devolve `null` quando não há nada plotável, e aí a página mostra o fallback.
 */
export function buildMapEmbedQuery(target: MapEmbedTarget): string | null {
  const placeId = target.placeId?.trim();
  if (placeId) return `place_id:${placeId}`;

  const lat = asFiniteNumber(target.latitude);
  const lng = asFiniteNumber(target.longitude);
  if (lat != null && lng != null) return `${lat},${lng}`;

  const address = target.address?.trim();
  if (address) return address;

  return null;
}

export type MapEmbedOptions = {
  /** Key pública do Maps (`VITE_GOOGLE_MAPS_API_KEY`). Sem ela não existe embed. */
  apiKey?: string;
  /** 15 enquadra bem um estacionamento; 13 dá o entorno de um aeroporto. */
  zoom?: number;
};

/**
 * URL do iframe da Embed API. Devolve `null` quando falta key ou alvo, e o chamador cai no
 * fallback: nunca renderizamos um iframe quebrado nem um `key=undefined` na URL.
 */
export function buildGoogleMapEmbedSrc(
  target: MapEmbedTarget,
  { apiKey, zoom = 15 }: MapEmbedOptions,
): string | null {
  const key = apiKey?.trim();
  if (!key) return null;

  const q = buildMapEmbedQuery(target);
  if (!q) return null;

  const params = new URLSearchParams({
    key,
    q,
    zoom: String(zoom),
    language: "pt-BR",
    region: "BR",
  });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}

/**
 * Link do Google Maps para abrir fora (o "Ver no Google Maps"). Sempre devolve uma URL válida,
 * porque o botão existe mesmo quando o embed não sobe.
 */
export function buildGoogleMapsHref(target: MapEmbedTarget): string {
  const placeId = target.placeId?.trim();
  if (placeId) {
    return `https://www.google.com/maps/place/?q=${encodeURIComponent(`place_id:${placeId}`)}`;
  }

  const lat = asFiniteNumber(target.latitude);
  const lng = asFiniteNumber(target.longitude);
  if (lat != null && lng != null) return `https://www.google.com/maps?q=${lat},${lng}`;

  const address = target.address?.trim();
  if (address) return `https://www.google.com/maps?q=${encodeURIComponent(address)}`;

  return "https://www.google.com/maps";
}
