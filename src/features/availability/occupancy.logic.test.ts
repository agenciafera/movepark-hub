import { describe, expect, it } from "vitest";
import { buildOccupancyMatrix, occupancyTone } from "./occupancy.logic";
import type { LocationOccupancyRow } from "@/types/domain";

const rows: LocationOccupancyRow[] = [
  { location_parking_type_id: "b", parking_type_name: "Valet", date: "2026-10-02", capacity: 10, booked_count: 2, blocked: false },
  { location_parking_type_id: "a", parking_type_name: "Coberta", date: "2026-10-01", capacity: 4, booked_count: 4, blocked: false },
  { location_parking_type_id: "a", parking_type_name: "Coberta", date: "2026-10-02", capacity: 4, booked_count: 1, blocked: true },
  { location_parking_type_id: "b", parking_type_name: "Valet", date: "2026-10-01", capacity: 10, booked_count: 0, blocked: false },
];

describe("buildOccupancyMatrix", () => {
  it("ordena datas e tipos de vaga", () => {
    const m = buildOccupancyMatrix(rows);
    expect(m.dates).toEqual(["2026-10-01", "2026-10-02"]);
    expect(m.rows.map((r) => r.name)).toEqual(["Coberta", "Valet"]);
  });

  it("preenche células com capacity/booked/pct", () => {
    const m = buildOccupancyMatrix(rows);
    const coberta = m.rows.find((r) => r.name === "Coberta")!;
    expect(coberta.cells["2026-10-01"]).toEqual({
      date: "2026-10-01",
      capacity: 4,
      booked: 4,
      pct: 1,
      blocked: false,
    });
    expect(coberta.cells["2026-10-02"].pct).toBeCloseTo(0.25, 5);
  });

  it("propaga o estado de bloqueio da data", () => {
    const m = buildOccupancyMatrix(rows);
    const coberta = m.rows.find((r) => r.name === "Coberta")!;
    expect(coberta.cells["2026-10-02"].blocked).toBe(true);
    expect(coberta.cells["2026-10-01"].blocked).toBe(false);
  });

  it("pct = 0 quando capacity = 0 (sem divisão por zero)", () => {
    const m = buildOccupancyMatrix([
      { location_parking_type_id: "x", parking_type_name: "Z", date: "2026-10-01", capacity: 0, booked_count: 0, blocked: false },
    ]);
    expect(m.rows[0].cells["2026-10-01"].pct).toBe(0);
  });

  it("matriz vazia para entrada vazia", () => {
    expect(buildOccupancyMatrix([])).toEqual({ dates: [], rows: [] });
  });
});

describe("occupancyTone", () => {
  it("classifica faixas de ocupação", () => {
    expect(occupancyTone(0)).toBe("low");
    expect(occupancyTone(0.49)).toBe("low");
    expect(occupancyTone(0.5)).toBe("mid");
    expect(occupancyTone(0.8)).toBe("high");
    expect(occupancyTone(1)).toBe("full");
    expect(occupancyTone(1.2)).toBe("full");
  });
});
