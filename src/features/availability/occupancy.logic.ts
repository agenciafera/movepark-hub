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

/** Faixa de ocupação para colorir a célula. */
export function occupancyTone(pct: number): "low" | "mid" | "high" | "full" {
  if (pct >= 1) return "full";
  if (pct >= 0.8) return "high";
  if (pct >= 0.5) return "mid";
  return "low";
}
