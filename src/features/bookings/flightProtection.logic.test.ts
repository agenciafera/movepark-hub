import { describe, expect, it } from "vitest";
import { formatBRL } from "@/lib/format";
import { coveredCheckOut, overageDays, overageForecastCents, protectionSummary } from "./flightProtection.logic";

describe("coveredCheckOut", () => {
  it("cobre até 24h; pedido menor fica como pedido", () => {
    expect(coveredCheckOut("2026-12-13T08:00:00Z", "2026-12-15T09:00:00Z")).toBe("2026-12-14T08:00:00.000Z");
    expect(coveredCheckOut("2026-12-13T08:00:00Z", "2026-12-13T20:00:00Z")).toBe("2026-12-13T20:00:00.000Z");
  });
});

describe("overageDays e overageForecastCents", () => {
  it("arredonda dias para cima e nunca é negativo", () => {
    expect(overageDays("2026-12-14T08:00:00Z", "2026-12-15T09:00:00Z")).toBe(2);
    expect(overageDays("2026-12-14T08:00:00Z", "2026-12-14T08:00:00Z")).toBe(0);
    expect(overageDays("2026-12-14T08:00:00Z", "2026-12-13T08:00:00Z")).toBe(0);
    expect(overageForecastCents("2026-12-14T08:00:00Z", "2026-12-15T09:00:00Z", 2700)).toBe(5400);
  });
});

describe("protectionSummary", () => {
  const fmt = (iso: string) => `[${iso}]`;
  it("diz o motivo, até quando é por nossa conta e o excedente", () => {
    const s = protectionSummary({ kind: "cancellation", new_check_out_at: "c", requested_check_out_at: "r", overage_daily_cents: 2700, overage_cents: 2700, actual_check_out_at: null, overage_charged_cents: null }, fmt);
    expect(s).toBe(`Voo cancelado: saída até [c] por nossa conta. Você pediu até [r]: depois de [c], ${formatBRL(27)} por dia, pago no estacionamento.`);
  });
  it("sem excedente e já encerrado", () => {
    expect(protectionSummary({ kind: "delay", new_check_out_at: "c", requested_check_out_at: "c", overage_daily_cents: 0, overage_cents: 0, actual_check_out_at: "a", overage_charged_cents: 0 }, fmt))
      .toBe("Voo atrasado: saída até [c] por nossa conta. Retirado em [a].");
  });
  it("motivo desconhecido cai em atraso", () => {
    expect(protectionSummary({ kind: "x", new_check_out_at: "c", requested_check_out_at: null, overage_daily_cents: 0, overage_cents: 0, actual_check_out_at: null, overage_charged_cents: null }, fmt))
      .toBe("Voo atrasado: saída até [c] por nossa conta.");
  });
});
