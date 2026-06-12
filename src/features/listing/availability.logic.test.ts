import { describe, expect, it } from "vitest";
import { availabilityUi, type AvailabilityCheck } from "./availability.logic";

function base(overrides: Partial<AvailabilityCheck> = {}): AvailabilityCheck {
  return {
    ok: true,
    capacity: 10,
    remaining: 10,
    sold_out: false,
    near_capacity: false,
    near_capacity_message: null,
    min_stay_ok: true,
    min_stay_value: null,
    min_stay_unit: null,
    min_date_ok: true,
    minimum_date: null,
    advance_ok: true,
    advance_minutes: null,
    days: 2,
    reasons: [],
    ...overrides,
  };
}

describe("availabilityUi", () => {
  it("é neutro quando não há dados (não bloqueia)", () => {
    expect(availabilityUi(null)).toEqual({ canReserve: true, message: null, tone: null });
    expect(availabilityUi(base({ error: "x" })).canReserve).toBe(true);
  });

  it("disponível sem avisos → libera, sem mensagem", () => {
    const r = availabilityUi(base());
    expect(r).toEqual({ canReserve: true, message: null, tone: null });
  });

  it("esgotado → bloqueia com mensagem de erro", () => {
    const r = availabilityUi(base({ ok: false, sold_out: true, reasons: ["sold_out"] }));
    expect(r.canReserve).toBe(false);
    expect(r.tone).toBe("error");
    expect(r.message).toMatch(/Esgotado/);
  });

  it("estadia mínima → mensagem pluralizada com a unidade", () => {
    const r = availabilityUi(
      base({ ok: false, min_stay_ok: false, min_stay_value: 3, min_stay_unit: "days" }),
    );
    expect(r.canReserve).toBe(false);
    expect(r.message).toBe("Essa vaga exige reserva mínima de 3 diárias.");
  });

  it("estadia mínima singular", () => {
    const r = availabilityUi(
      base({ ok: false, min_stay_ok: false, min_stay_value: 1, min_stay_unit: "days" }),
    );
    expect(r.message).toBe("Essa vaga exige reserva mínima de 1 diária.");
  });

  it("antecedência mínima → bloqueia com minutos", () => {
    const r = availabilityUi(base({ ok: false, advance_ok: false, advance_minutes: 30 }));
    expect(r.canReserve).toBe(false);
    expect(r.message).toMatch(/30 min/);
  });

  it("quase-lotação → libera mas avisa (warning)", () => {
    const r = availabilityUi(
      base({ near_capacity: true, near_capacity_message: "Últimas vagas!" }),
    );
    expect(r.canReserve).toBe(true);
    expect(r.tone).toBe("warning");
    expect(r.message).toBe("Últimas vagas!");
  });

  it("quase-lotação sem mensagem custom usa fallback", () => {
    const r = availabilityUi(base({ near_capacity: true }));
    expect(r.message).toMatch(/poucas vagas/);
  });

  it("esgotado tem prioridade sobre quase-lotação", () => {
    const r = availabilityUi(base({ ok: false, sold_out: true, near_capacity: true }));
    expect(r.message).toMatch(/Esgotado/);
  });
});
