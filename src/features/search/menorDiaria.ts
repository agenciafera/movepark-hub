/**
 * Preço de vitrine do card: a MENOR diária que o lote pratica, e a duração em que ela vale.
 *
 * O card mostrava o preço da janela que a vitrine pediu, que é sempre a mais curta e por isso
 * sempre a mais cara: o Virapark aparecia por R$ 40,00 numa tabela cuja diária cai para
 * R$ 24,90 em estadia de 7 dias. Quem compara card com card estava comparando o pior preço de
 * cada unidade.
 *
 * Quem calcula é o motor no Postgres (RPC `lowest_daily_rate`, que simula as durações de
 * referência da vitrine e devolve a mais barata por diária). Aqui só se transporta e se
 * escreve o rótulo: preço nunca é recalculado em TypeScript (docs/specs/pricing-engine.md).
 */

/** Linha crua da RPC `lowest_daily_rate`. */
export type LowestDailyRow = {
  location_parking_type_id: string;
  days: number;
  total: number | string | null;
  old_total: number | string | null;
  daily: number | string | null;
  min_stay_days: number | null;
};

/** O preço de partida de um lote, já em número. */
export type LowestDaily = {
  /** Total da estadia que ficou mais barata por diária. */
  total: number;
  /** Balcão da mesma estadia, quando existe e é maior. */
  oldTotal: number | null;
  /** A diária: `total / days`, arredondada no banco. É o número grande do card. */
  daily: number;
  /** Duração em que essa diária vale. Vai no rótulo, porque é a condição do preço. */
  days: number;
  /** Menor estadia que o lote vende, quando exige mais de uma diária. */
  minStayDays: number | null;
};

function num(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Mapa `location_parking_type.id → menor diária`, pronto para o card consultar. */
export function mapLowestDaily(
  rows: LowestDailyRow[] | null | undefined,
): Map<string, LowestDaily> {
  const map = new Map<string, LowestDaily>();
  for (const row of rows ?? []) {
    const total = num(row.total);
    const daily = num(row.daily);
    const days = Number(row.days);
    // Sem total, sem diária ou sem duração não há preço para mostrar, e inventar um é pior
    // do que o card sem preço.
    if (total == null || total <= 0 || daily == null || daily <= 0 || !(days >= 1)) continue;
    const oldTotal = num(row.old_total);
    map.set(row.location_parking_type_id, {
      total,
      // Balcão que não é maior não é desconto, é ruído riscado no card.
      oldTotal: oldTotal != null && oldTotal > total ? oldTotal : null,
      daily,
      days,
      minStayDays: row.min_stay_days != null && row.min_stay_days > 1 ? row.min_stay_days : null,
    });
  }
  return map;
}

/**
 * Rótulo embaixo do número.
 *
 * Diz a duração exata em que aquela diária vale, e não "a partir de N dias": a tabela pode subir
 * de novo depois (a BePark tem a diária mais barata em 30 dias e volta a subir em 31), então
 * prometer "N ou mais" seria afirmar o que o motor não garante.
 */
export function rotuloDaDiaria(days: number): string {
  return days > 1 ? `por diária na estadia de ${days} dias` : "por diária";
}
