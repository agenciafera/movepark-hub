// Regras de match da auditoria de endereço.
//
// Separado do index.ts porque é aqui que mora a decisão de aceitar ou recusar um lugar do
// Google, e essa decisão precisa de teste (deno test) sem rede.
//
// O critério de aceite é herdado do E0.17-i (docs/specs/place-id-lote-mapeado.md), que já
// pagou o preço de aprender:
//
//   - Um match errado é pior que nenhum: publica o nome de um lugar com o pino de outro.
//   - Distância só vale como sinal quando o nome é fraco. Na primeira passada daquele épico,
//     Park Confins, Decolar Park e Connect Park foram recusados por distância, e quem estava
//     errado era o nosso pino, não o do Google.
//   - primaryType precisa incluir park_and_ride, senão o Connect Park cai fora por um regex
//     que não conhecia esse valor.
//
// A distância NÃO é calculada aqui: quem mede é o Postgres (ADR-001). Este módulo só escolhe
// o candidato e mede a similaridade do nome.

export type PlaceCandidate = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  googleMapsUri?: string;
};

export type MatchPolicy = {
  name_similarity_strong: number;
  name_similarity_weak: number;
  max_km_strong: number;
  max_km_weak: number;
};

export const DEFAULT_MATCH_POLICY: MatchPolicy = {
  name_similarity_strong: 0.85,
  name_similarity_weak: 0.6,
  max_km_strong: 15,
  max_km_weak: 3,
};

/** Tipos de lugar que contam como estacionamento. `park_and_ride` é obrigatório aqui. */
const PARKING_TYPES = new Set(["parking_lot", "parking_garage", "park_and_ride"]);

/** Minúsculo, sem acento, só letras e números. Base da comparação de nome e de endereço. */
export function normalize(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Similaridade de nome entre 0 e 1.
 *
 * Contido (um nome dentro do outro) vale 1: o Google escreve "Fulano Park - Estacionamento
 * Aeroporto" para o que chamamos de "Fulano Park", e recusar isso descartaria os
 * matches bons. Fora esse caso, é Sørensen-Dice sobre bigramas, que tolera erro de digitação
 * e ordem trocada sem trazer a complexidade de uma distância de edição.
 */
export function nameSimilarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y || x.includes(y) || y.includes(x)) return 1;

  const bigrams = (s: string) => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };
  const bx = bigrams(x);
  const by = bigrams(y);
  if (bx.length === 0 || by.length === 0) return 0;

  const pool = new Map<string, number>();
  for (const g of bx) pool.set(g, (pool.get(g) ?? 0) + 1);

  let hits = 0;
  for (const g of by) {
    const left = pool.get(g) ?? 0;
    if (left > 0) {
      pool.set(g, left - 1);
      hits++;
    }
  }
  return (2 * hits) / (bx.length + by.length);
}

/**
 * Distância aproximada em km, usada SÓ como filtro de candidato dentro desta função.
 *
 * ADR-001 proíbe geo em TS para o que o produto exibe ou grava, e nada do que sai daqui é
 * distância: o `drift_m` que vai para o banco é medido por ST_Distance na RPC
 * `location_address_audit_record`. Aqui é só para descartar um candidato a 300 km antes de
 * gastar uma escrita, e por isso a aproximação basta.
 */
function roughKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = (aLat - bLat) * 111.32;
  const dLng = (aLng - bLng) * 111.32 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export type MatchInput = {
  /** Nome da unidade como está no Hub. */
  name: string;
  /** Coordenada gravada hoje. Null quando a unidade não tem geo. */
  latitude: number | null;
  longitude: number | null;
};

export type MatchResult =
  | { accepted: true; place: PlaceCandidate; similarity: number }
  | { accepted: false; reason: string };

/**
 * Escolhe entre os candidatos do Google o que dá para aceitar, ou explica por que nenhum.
 *
 * Ordem: primeiro descarta o que não é estacionamento aberto, depois pontua por nome e só
 * então olha a distância, com a tolerância que o nome forte merece.
 */
export function pickMatch(
  input: MatchInput,
  candidates: PlaceCandidate[],
  policy: MatchPolicy = DEFAULT_MATCH_POLICY,
): MatchResult {
  if (candidates.length === 0) return { accepted: false, reason: "sem candidatos" };

  let bestRejected = "nenhum candidato passou no critério";
  let best: { place: PlaceCandidate; similarity: number } | null = null;

  for (const place of candidates) {
    if (place.businessStatus && place.businessStatus !== "OPERATIONAL") {
      bestRejected = `lugar não operacional (${place.businessStatus})`;
      continue;
    }

    const tipos = [place.primaryType, ...(place.types ?? [])].filter(Boolean) as string[];
    if (tipos.length > 0 && !tipos.some((t) => PARKING_TYPES.has(t))) {
      bestRejected = `tipo não é estacionamento (${tipos.slice(0, 3).join(", ")})`;
      continue;
    }

    const similarity = nameSimilarity(input.name, place.displayName?.text ?? "");
    if (similarity < policy.name_similarity_weak) {
      bestRejected = `nome distante demais (${similarity.toFixed(2)})`;
      continue;
    }

    // Sem geo nossa não há como filtrar por distância, e é justamente a unidade que mais
    // precisa de um pino. Aceita pelo nome e deixa a divergência para o revisor.
    if (input.latitude !== null && input.longitude !== null && place.location) {
      const km = roughKm(
        input.latitude,
        input.longitude,
        place.location.latitude ?? 0,
        place.location.longitude ?? 0,
      );
      const teto =
        similarity >= policy.name_similarity_strong ? policy.max_km_strong : policy.max_km_weak;
      if (km > teto) {
        bestRejected = `a ${km.toFixed(1)} km do pino atual, acima do teto de ${teto} km para similaridade ${similarity.toFixed(2)}`;
        continue;
      }
    }

    if (!best || similarity > best.similarity) best = { place, similarity };
  }

  if (!best) return { accepted: false, reason: bestRejected };
  return { accepted: true, place: best.place, similarity: best.similarity };
}

/** A query textual da busca: nome e endereço juntos, que é o que identifica o lugar. */
export function buildTextQuery(name: string, address: string | null): string {
  return [name, address].filter(Boolean).join(", ");
}

/** Place ID de estabelecimento começa por ChIJ. O resto resolve endereço, não negócio. */
export function isEstablishmentPlaceId(placeId: string | null | undefined): boolean {
  return typeof placeId === "string" && placeId.startsWith("ChIJ");
}

/** Confere a chave de serviço em tempo constante, como as demais Edges internas do repo. */
export function isAuthorized(received: string | null, expected: string | undefined): boolean {
  if (!expected || !received) return false;
  if (received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < received.length; i++) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
