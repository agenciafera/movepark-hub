// Proximidade haversine compartilhada pela busca (PRD-09 / DAT-04 / DAT-05).
// Sem API externa, sem PostGIS — distância calculada. Espelha public.haversine_km do banco.

/** Distância em km entre dois pontos (haversine, R = 6371 km). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type TerminalPoint = { name: string; latitude: number | null; longitude: number | null };
export type NearestTerminal = { name: string; distance_km: number };

/**
 * Terminal mais próximo de um lote dentre os pontos do destino (DAT-05).
 * Retorna null se o lote não tem geo ou o destino não tem pontos (cai na proximidade ao
 * centro do DAT-04). Pontos sem geo são ignorados.
 */
export function nearestTerminal(
  lat: number | null,
  lng: number | null,
  points: TerminalPoint[],
): NearestTerminal | null {
  if (lat == null || lng == null || points.length === 0) return null;
  let best: NearestTerminal | null = null;
  for (const p of points) {
    if (p.latitude == null || p.longitude == null) continue;
    const d = haversineKm(lat, lng, Number(p.latitude), Number(p.longitude));
    if (best == null || d < best.distance_km) {
      best = { name: p.name, distance_km: Number(d.toFixed(2)) };
    }
  }
  return best;
}
