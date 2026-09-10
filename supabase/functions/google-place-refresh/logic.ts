// Lógica pura do refresh do Google Places. Sem rede e sem Deno.env → testável.

export const REFRESH_AFTER_DAYS = 7;

export type GoogleReviewItem = {
  rating: number;
  text: string;
  publishTime: string;
  relativePublishTimeDescription: string;
  authorName: string;
  authorPhotoUri: string | null;
  authorUri: string | null;
  reviewUri: string | null;
};

export type SnapshotFreshness = { place_id: string; fetched_at: string };

/**
 * Quais place_ids precisam de refresh: os sem snapshot e os com mais de 7 dias.
 * A janela de 7 dias contra o prazo de 30 do Google dá quatro tentativas antes de o selo
 * sumir da vitrine.
 */
export function selectStale(
  candidates: string[],
  snapshots: SnapshotFreshness[],
  now: Date,
): string[] {
  const cutoff = now.getTime() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const fresh = new Set(
    snapshots
      .filter((s) => new Date(s.fetched_at).getTime() > cutoff)
      .map((s) => s.place_id),
  );
  return candidates.filter((id) => !fresh.has(id));
}

/**
 * Guarda de autorização do refresh: só passa com o header secreto correto.
 * `expected` ausente ou vazio nunca autoriza (evita comparar contra string vazia).
 */
export function isAuthorized(provided: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  return provided === expected;
}

type RawReview = {
  rating?: number;
  /** Versão localizada pelo `languageCode` da chamada. Traduzida por máquina quando o autor
   *  escreveu em outra língua. */
  text?: { text?: string };
  /** O texto na língua em que o autor escreveu. É este que a gente guarda. */
  originalText?: { text?: string };
  publishTime?: string;
  relativePublishTimeDescription?: string;
  googleMapsUri?: string;
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
};

/**
 * Traduz a resposta do Places (New) para a linha do espelho.
 * Review sem nome de autor é DESCARTADA: exibir sem atribuição não é permitido, então
 * guardar um dado que não pode ser mostrado só cria lixo com prazo de validade.
 *
 * O texto guardado é o `originalText`, e não o `text`. A chamada manda `languageCode=pt-BR`,
 * então o `text` que volta é tradução de máquina quando a avaliação foi escrita em outra
 * língua. Publicar isso como se fossem as palavras do autor quebra a regra de atribuição
 * (§11: não traduzir, não resumir, não cortar). O `text` fica como reserva para o caso de o
 * Places não mandar o original: nesse cenário é ele ou nada.
 */
export function mapPlaceDetails(place: unknown): {
  rating: number | null;
  user_rating_count: number;
  maps_uri: string | null;
  reviews: GoogleReviewItem[];
} {
  const p = (place ?? {}) as {
    rating?: number | null;
    userRatingCount?: number | null;
    googleMapsUri?: string | null;
    reviews?: RawReview[];
  };

  const reviews: GoogleReviewItem[] = (p.reviews ?? [])
    .filter((r) => !!r.authorAttribution?.displayName)
    .map((r) => ({
      rating: r.rating ?? 0,
      text: r.originalText?.text ?? r.text?.text ?? "",
      publishTime: r.publishTime ?? "",
      relativePublishTimeDescription: r.relativePublishTimeDescription ?? "",
      authorName: r.authorAttribution!.displayName!,
      authorPhotoUri: r.authorAttribution?.photoUri ?? null,
      authorUri: r.authorAttribution?.uri ?? null,
      reviewUri: r.googleMapsUri ?? null,
    }));

  return {
    rating: p.rating ?? null,
    user_rating_count: p.userRatingCount ?? 0,
    maps_uri: p.googleMapsUri ?? null,
    reviews,
  };
}

// ---------------------------------------------------------------------------
// Resolução de place_id por busca de texto (E0.17-i automatizado)
//
// Ficha sem `google_place_id` nunca entra no refresh, então nasce sem selo e fica sem para
// sempre: o cron só olha quem já tem a chave. Até aqui a resolução era manual, pelo console
// de uma aba autorizada (ver `docs/specs/place-id-lote-mapeado.md`). Isto automatiza aquele
// método, com os mesmos critérios de aceite, porque **um match errado é pior que nenhum**:
// publica um lote com o nome de um lugar e a reputação de outro.
// ---------------------------------------------------------------------------

/**
 * Tipos que valem como estacionamento. `park_and_ride` entra junto com os dois óbvios porque
 * o Connect Park (CWB) foi rejeitado na rodada manual por um regex `/parking/` que não pegava
 * esse valor.
 */
export const PLACE_TYPES_OK = ["parking_lot", "parking_garage", "park_and_ride"];

/**
 * Quanto tempo esperar antes de tentar de novo resolver o place_id de uma ficha que não casou.
 * Sem essa janela, as fichas sem match (eram 10 na rodada manual) voltariam a consultar a
 * Places API toda semana, para sempre, por uma resposta que já se sabe qual é.
 */
export const RETRY_LOOKUP_AFTER_DAYS = 30;

/** Raio do `locationBias` da busca, em metros. */
export const SEARCH_BIAS_RADIUS_M = 5000;

/**
 * Palavras que aparecem em quase todo nome de estacionamento de aeroporto e por isso não
 * distinguem nada. Sem removê-las, "Aero Park" e "DF Park" empatam em "park", que foi
 * exatamente como os leads de Brasília entraram errado na rodada manual.
 */
const GENERICO = new Set([
  "estacionamento", "estacionamentos", "aeroporto", "aeroportos", "airport", "parking",
  "park", "internacional", "international", "de", "do", "da", "dos", "das", "e", "o", "a",
  "os", "as", "em", "no", "na", "vcp", "gru", "cgh", "cnf", "bsb", "sdu", "gig", "ltda", "me",
]);

/** Minúscula, sem acento, sem pontuação, espaço colapsado. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tokens que de fato distinguem um lugar do outro. Cai para os tokens crus se o nome for só genérico. */
function tokensDistintivos(nome: string): string[] {
  const todos = normalizeName(nome).split(" ").filter(Boolean);
  const fortes = todos.filter((t) => !GENERICO.has(t));
  return fortes.length ? fortes : todos;
}

/**
 * Similaridade de nome entre 0 e 1, na escala que a spec usa nos limites (0.85 e 0.60).
 *
 * Três degraus, do mais forte para o mais fraco:
 * 1. Igual depois de normalizar → 1.
 * 2. **Contenção**: todo token distintivo do nome curto aparece no longo → 0.9. É o caso comum,
 *    porque o Google devolve "Bandeira Park - Estacionamento Aeroporto Viracopos Campinas VCP"
 *    para o nosso "Bandeira Park". Dice puro daria 0.5 nesse par e reprovaria um match certo.
 * 3. Coeficiente de Dice sobre os tokens distintivos.
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (normalizeName(a) === normalizeName(b)) return 1;

  const ta = new Set(tokensDistintivos(a));
  const tb = new Set(tokensDistintivos(b));
  if (!ta.size || !tb.size) return 0;

  const [curto, longo] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if ([...curto].every((t) => longo.has(t))) return 0.9;

  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return (2 * comuns) / (ta.size + tb.size);
}

/** Distância em quilômetros entre dois pontos. Só para o critério de aceite: o geo de produção é PostGIS (ADR-001). */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type PlaceCandidate = {
  id: string;
  displayName: string;
  formattedAddress: string | null;
  businessStatus: string | null;
  primaryType: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type PlaceTarget = { name: string; latitude: number; longitude: number };

/**
 * O par (similaridade, distância) que a spec fixou. Tolerância larga para nome forte não é
 * folga: na rodada manual, Park Confins, Decolar Park e Connect Park foram reprovados por
 * distância e quem estava errado era o pino do OpenStreetMap, não o Google. Distância só
 * vale como sinal quando o nome é fraco.
 */
function dentroDoAceite(sim: number, km: number): boolean {
  if (sim >= 0.85) return km <= 15;
  if (sim >= 0.6) return km <= 3;
  return false;
}

/** Margem mínima entre o 1º e o 2º colocado para o match ser considerado sem empate. */
export const MARGEM_MINIMA = 0.05;

/**
 * Escolhe o place_id de um Text Search, ou `null` quando não dá para confiar.
 *
 * `emUso` é a guarda do D-009: place_id já preso a outra ficha não pode ser reaproveitado,
 * senão duas fichas viram o mesmo pino. Isso não é hipótese: MultiPark e Bandeira Park (GRU)
 * têm coordenada idêntica e IDs distintos, e o mesmo par se repete em Viracopos.
 *
 * Empate reprova. Quando os dois primeiros passam no aceite e ficam a menos de `MARGEM_MINIMA`
 * um do outro, devolve `null`: sem desempate confiável, não escolher é a resposta certa.
 */
export function pickPlaceMatch(
  target: PlaceTarget,
  candidates: PlaceCandidate[],
  emUso: Set<string> = new Set(),
): PlaceCandidate | null {
  const aprovados = candidates
    .filter((c) => c.id && !emUso.has(c.id))
    .filter((c) => c.businessStatus === "OPERATIONAL")
    .filter((c) => !!c.primaryType && PLACE_TYPES_OK.includes(c.primaryType))
    .filter((c) => c.latitude !== null && c.longitude !== null)
    .map((c) => ({
      c,
      sim: nameSimilarity(target.name, c.displayName),
      km: haversineKm(target.latitude, target.longitude, c.latitude!, c.longitude!),
    }))
    .filter((x) => dentroDoAceite(x.sim, x.km))
    .sort((x, y) => y.sim - x.sim || x.km - y.km);

  if (!aprovados.length) return null;
  if (aprovados.length > 1 && aprovados[0].sim - aprovados[1].sim < MARGEM_MINIMA) return null;
  return aprovados[0].c;
}
