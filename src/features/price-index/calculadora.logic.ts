/**
 * Lógica pura da calculadora (/calculadora-estacionamento-aeroporto): dado um
 * destino e um número de diárias, o ranking do que custa cada vaga de parceiro.
 * Reusa a matriz do índice; a única regra própria é separar quem cota daquela
 * duração de quem exige estadia mínima maior.
 */

import {
  buildMatrix,
  type MatrixCell,
  type MatrixRow,
  type PriceDestination,
} from "./priceIndex.logic";

export const CALC_MIN_DAYS = 1;
export const CALC_MAX_DAYS = 60;
export const CALC_QUICK_DAYS = [1, 7, 15, 30];

/** Entrada saneada: inteiro entre 1 e 60, senão null (o form explica). */
export function sanitizeDays(value: string | number): number | null {
  const n = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < CALC_MIN_DAYS || n > CALC_MAX_DAYS) return null;
  return n;
}

export type CalcRow = {
  row: MatrixRow;
  cell: MatrixCell;
};

export type CalcResult = {
  days: number;
  /** Ranqueadas do menor para o maior total. */
  priced: CalcRow[];
  /** Sem preço nessa duração por estadia mínima do parceiro. */
  blocked: CalcRow[];
};

export function calcResults(dest: PriceDestination, days: number): CalcResult {
  const { rows } = buildMatrix(dest, [days], days);
  const priced: CalcRow[] = [];
  const blocked: CalcRow[] = [];
  for (const row of rows) {
    const cell = row.cells[0];
    if (cell.total != null) priced.push({ row, cell });
    else if (cell.minStayDays != null) blocked.push({ row, cell });
  }
  return { days, priced, blocked };
}
