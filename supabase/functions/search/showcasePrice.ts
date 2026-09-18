/**
 * Preço de vitrine: a MENOR diária que cada lote pratica, e a duração em que ela vale.
 *
 * A busca simulava o preço da janela pedida, e na vitrine (home e `/destinos`) essa janela é
 * nossa, não do cliente. Como é sempre a mais curta, ela é sempre a mais cara: o Virapark
 * aparecia por R$ 40,00 numa tabela cuja diária cai para R$ 24,90 em estadia de 7 dias, e o
 * cliente comparava cards pelo pior preço de cada unidade.
 *
 * Quem responde qual é a menor diária é o motor, na RPC `lowest_daily_rate`: uma chamada para a
 * página inteira, que simula as durações de referência da vitrine (as mesmas de
 * `destination_price_index`, então card e tabela de preços não brigam) mais a menor estadia que
 * o lote vende. Aqui só se transporta: preço não se recalcula fora do Postgres
 * (docs/specs/pricing-engine.md).
 *
 * Isto substituiu o resgate por estadia mínima (`minStay.ts`), que existia só para quem não
 * tinha preço na janela: a menor estadia vendável agora é uma das durações simuladas, então o
 * lote que só vende a partir de 3 diárias continua entrando na lista, e pelo melhor preço dele.
 */

/** Linha crua da RPC. Numérico do Postgres chega como string no PostgREST. */
export type LowestDailyRow = {
  location_parking_type_id: string;
  days: number;
  total: number | string | null;
  old_total: number | string | null;
  daily: number | string | null;
  min_stay_days: number | null;
};

export type ShowcasePrice = {
  /** Total da estadia em que a diária ficou mais barata. */
  total: number;
  /** Balcão da mesma estadia, só quando maior (senão não há o que riscar). */
  oldTotal: number | null;
  /** Duração que o total cobre. Vira `price.days` e o rótulo do card. */
  days: number;
  /** Menor estadia vendável, quando o lote exige mais de uma diária. */
  minStayDays: number | null;
};

/** Teto de ids por chamada, espelhando o guarda da RPC. */
export const SHOWCASE_BATCH = 50;

function num(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Quebra a lista em lotes para não estourar o teto de ids da RPC. */
export function batchIds(ids: string[], size = SHOWCASE_BATCH): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Mapa `location_parking_type.id → preço de vitrine`. Linha sem preço fica de fora. */
export function buildShowcaseMap(rows: LowestDailyRow[] | null): Map<string, ShowcasePrice> {
  const map = new Map<string, ShowcasePrice>();
  for (const row of rows ?? []) {
    const total = num(row.total);
    const days = Number(row.days);
    if (total == null || total <= 0 || !(days >= 1)) continue;
    const oldTotal = num(row.old_total);
    map.set(row.location_parking_type_id, {
      total,
      oldTotal: oldTotal != null && oldTotal > total ? oldTotal : null,
      days,
      minStayDays: row.min_stay_days != null && row.min_stay_days > 1 ? row.min_stay_days : null,
    });
  }
  return map;
}
