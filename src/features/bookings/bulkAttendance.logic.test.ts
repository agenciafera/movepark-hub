import { describe, expect, it } from "vitest";
import { bulkSummary, planBulkAttendance } from "./bulkAttendance.logic";
import type { UnifiedBookingRow } from "@/types/domain";

const hub = (id: string, status: string) =>
  ({ source: "hub", id, booking: { id, code: `MP-${id}`, status } }) as unknown as UnifiedBookingRow;
const site = (id: string, site_status: string, check_in_at: string) =>
  ({ source: "wl", id, wl: { id, wl_order_number: `W-${id}`, site_status, check_in_at } }) as unknown as UnifiedBookingRow;

const now = new Date("2027-10-02T12:00:00Z");
const rows = [
  hub("1", "confirmed"),
  hub("2", "completed"),
  site("3", "confirmed", "2027-10-02T10:00:00Z"),
  site("4", "confirmed", "2027-10-03T10:00:00Z"),
  site("5", "cancelled", "2027-10-01T10:00:00Z"),
];

describe("planBulkAttendance", () => {
  it("chegou: cada origem pela regra dela, e o resto é pulado com motivo", () => {
    const p = planBulkAttendance(rows, "arrived", { wlAttendance: true, now });
    expect(p.steps).toEqual([
      { source: "hub", id: "1", code: "MP-1", status: "checked_in" },
      { source: "wl", id: "3", code: "W-3", attendance: "compareceu" },
    ]);
    expect(p.skipped).toEqual({ status: 2, antes_do_horario: 1, site_sem_permissao: 0 });
  });

  it("não veio não espera o horário de entrada", () => {
    const p = planBulkAttendance(rows, "no_show", { wlAttendance: true, now });
    expect(p.steps.map((s) => s.id)).toEqual(["1", "3", "4"]);
  });

  it("sem as ações do site ligadas, as reservas do site são puladas", () => {
    const p = planBulkAttendance(rows, "no_show", { wlAttendance: false, now });
    expect(p.steps.map((s) => s.id)).toEqual(["1"]);
    expect(p.skipped.site_sem_permissao).toBe(3);
  });
});

describe("bulkSummary", () => {
  it("diz quantas marcou e por que pulou", () => {
    expect(bulkSummary(2, 0, { status: 2, antes_do_horario: 1, site_sem_permissao: 0 })).toBe(
      "2 marcadas. 3 puladas: 2 não estavam confirmadas, 1 antes do horário de entrada.",
    );
    expect(bulkSummary(1, 1, { status: 0, antes_do_horario: 0, site_sem_permissao: 0 })).toBe("1 marcada. 1 não gravou.");
  });
});
