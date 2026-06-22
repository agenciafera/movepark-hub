import type { LocationOccupancyRow } from "@/types/domain";

export type OccupancyCell = {
  date: string;
  capacity: number;
  booked: number;
  /** Ocupação 0..1 (booked/capacity; 0 quando capacity = 0). */
  pct: number;
  /** Data bloqueada pelo estacionamento (não aceita reservas). */
  blocked: boolean;
};

export type OccupancyMatrixRow = {
  lptId: string;
  name: string;
  cells: Record<string, OccupancyCell>;
};

export type OccupancyMatrix = {
  dates: string[];
  rows: OccupancyMatrixRow[];
};

/** Pivota as linhas (lpt × data) numa matriz de tipos de vaga por data. */
export function buildOccupancyMatrix(rows: LocationOccupancyRow[]): OccupancyMatrix {
  const dateSet = new Set<string>();
  const byLpt = new Map<string, OccupancyMatrixRow>();

  for (const r of rows) {
    dateSet.add(r.date);
    let row = byLpt.get(r.location_parking_type_id);
    if (!row) {
      row = { lptId: r.location_parking_type_id, name: r.parking_type_name, cells: {} };
      byLpt.set(r.location_parking_type_id, row);
    }
    const pct = r.capacity > 0 ? r.booked_count / r.capacity : 0;
    row.cells[r.date] = {
      date: r.date,
      capacity: r.capacity,
      booked: r.booked_count,
      pct,
      blocked: r.blocked ?? false,
    };
  }

  const dates = Array.from(dateSet).sort();
  const matrixRows = Array.from(byLpt.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { dates, rows: matrixRows };
}

/**
 * Ocupação efetiva somando o vendido no WL (E2.5.1).
 * count = reservas do hub + vendidas no WL; pct limitado a 1 (overbooking aparece como cheio).
 */
export function withExternal(
  booked: number,
  external: number,
  capacity: number,
): { count: number; pct: number } {
  const count = booked + external;
  const pct = capacity > 0 ? Math.min(count / capacity, 1) : 0;
  return { count, pct };
}

/** Meses (ano+mês 1-12) cobertos por um intervalo de datas [from, to] (YYYY-MM-DD). */
export function monthsInRange(from: string, to: string): { year: number; month: number }[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: { year: number; month: number }[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Grade de um mês como semanas (domingo→sábado) de datas YYYY-MM-DD; `null` é célula de
 * preenchimento (antes do dia 1 ou depois do último dia). month é 1-12.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const startWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = domingo
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  const mm = String(month).padStart(2, "0");
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${mm}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Faixa de ocupação para colorir a célula. */
export function occupancyTone(pct: number): "low" | "mid" | "high" | "full" {
  if (pct >= 1) return "full";
  if (pct >= 0.8) return "high";
  if (pct >= 0.5) return "mid";
  return "low";
}
