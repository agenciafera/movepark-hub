import { describe, expect, it } from "vitest";
import { buildHubTimeline, historyText, type BookingHistoryEntry } from "./bookingHistory.logic";

const fmt = { dateTime: (v: string) => v.slice(0, 10), brl: (v: number) => `R$${v}` };
const e = (over: Partial<BookingHistoryEntry>): BookingHistoryEntry => ({
  id: "x", type: "status_change", created_at: "2027-10-02T10:00:00Z", actor_role: "staff",
  actor_name: null, changes: null, amount_delta_cents: null, reason: null, ...over,
});

describe("historyText", () => {
  it("check-in com quem fez", () => {
    expect(historyText(e({ changes: { status: { from: "confirmed", to: "checked_in" } }, actor_name: "Equipe Movepark" }), fmt))
      .toBe("Check-in por Equipe Movepark");
  });
  it("cancelamento com estorno e motivo", () => {
    expect(historyText(e({ type: "cancel", amount_delta_cents: -12345, reason: "cliente pediu", actor_name: "Cliente" }), fmt))
      .toBe("Cancelada (devolvido R$123.45): cliente pediu por Cliente");
  });
  it("troca de placa com as duas placas; sistema sem nome vira automático", () => {
    expect(historyText(e({ type: "vehicle_change", actor_role: "system", changes: { from: { license_plate: "AAA1A11" }, to: { license_plate: "BBB2B22" } } }), fmt))
      .toBe("Placa trocada de AAA1A11 para BBB2B22 (automático)");
  });
});

describe("buildHubTimeline", () => {
  const base = {
    created_at: "2027-10-01T10:00:00Z", status: "completed", updated_at: "2027-10-03T10:00:00Z",
    checked_in_at: "2027-10-02T10:00:00Z", checked_out_at: "2027-10-03T10:00:00Z",
    paid_at: "2027-10-01T10:05:00Z", payment_method: "PIX", payment_failed_at: null,
  };
  it("o check-in do histórico substitui a linha genérica; o check-out sem histórico fica", () => {
    const t = buildHubTimeline(base, [e({ created_at: "2027-10-02T10:00:01Z", changes: { status: { to: "checked_in" } }, actor_name: "Dona" })], fmt);
    expect(t.map((x) => x.text)).toEqual(["Criada", "Paga (PIX)", "Check-in por Dona", "Check-out"]);
  });
});
