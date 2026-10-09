import { describe, expect, it } from "vitest";
import { attendanceLabel, buildWlTimeline, canMarkArrived, centsToReais, wlActionTimelineLabel, wlPaymentMethodLabel, wlBookingStatusLabel, wlBookingStatusTone } from "./wlBooking.logic";

describe("wlBooking.logic", () => {
  it("rotula o status vindo do site, com fallback para desconhecido", () => {
    expect(wlBookingStatusLabel("confirmed")).toBe("Paga");
    expect(wlBookingStatusLabel("refund_requested")).toBe("Reembolso pedido");
    expect(wlBookingStatusLabel("qualquer")).toBe("Outro");
    expect(wlBookingStatusLabel(null)).toBe("Outro");
    expect(wlBookingStatusTone("cancelled")).toBe("cancelled");
    expect(wlBookingStatusTone("xyz")).toBe("neutral");
  });

  it("comparecimento como o backoffice do site grava", () => {
    expect(attendanceLabel("compareceu")).toBe("Compareceu");
    expect(attendanceLabel("no_show")).toBe("Não compareceu");
    expect(attendanceLabel("pendente")).toBe("Ainda não marcado");
    expect(attendanceLabel(null)).toBe("Ainda não marcado");
  });

  it("centavos para reais, sem inventar zero", () => {
    expect(centsToReais(15050)).toBe(150.5);
    expect(centsToReais(null)).toBeNull();
  });
});

describe("canMarkArrived", () => {
  const now = new Date("2027-10-02T12:00:00Z");
  it("só a partir do horário de entrada", () => {
    expect(canMarkArrived("2027-10-02T11:00:00Z", now)).toBe(true);
    expect(canMarkArrived("2027-10-03T11:00:00Z", now)).toBe(false);
    expect(canMarkArrived(null, now)).toBe(true);
  });
});

describe("wlActionTimelineLabel", () => {
  it("comparecimento, com quem fez", () => {
    expect(wlActionTimelineLabel({ action: "attendance", request: { status: "no_show" }, result: "ok", message: null, by_name: "Bia" }))
      .toBe("Marcada como não compareceu por Bia");
    expect(wlActionTimelineLabel({ action: "attendance", request: { status: "pendente" }, result: "ok", message: null, by_name: null }))
      .toBe("Marcação de comparecimento desfeita");
  });
  it("troca de placa e falha de rede", () => {
    expect(wlActionTimelineLabel({ action: "license_plate", request: { license_plate: "abc1d23" }, result: "error", message: "timeout", by_name: null }))
      .toBe("Não gravou: placa trocada para ABC1D23. Não chegou ao site: timeout");
  });
});

describe("buildWlTimeline", () => {
  const base = {
    wl_created_at: "2027-10-01T10:00:00Z",
    synced_at: "2027-10-02T12:00:00Z",
    attendance_status: "compareceu",
    attendance_marked_at: "2027-10-02T09:00:00Z",
  };
  const ok = { action: "license_plate", request: { license_plate: "BBB2B22" }, result: "ok", message: null, by_name: "Bia", created_at: "2027-10-02T08:00:00Z" };
  const recusada = { ...ok, result: "refused", message: "Voucher usado.", created_at: "2027-10-02T08:30:00Z" };

  it("com histórico do site: ele é a fonte, e a ação do Hub já copiada não repete", () => {
    const t = buildWlTimeline({
      ...base,
      actions: [ok, recusada],
      site_events: [
        { kind: "history", occurred_at: "2027-10-02T08:00:01Z", actor: null, note: "Placa alterada: AAA1A11 → BBB2B22 (Movepark Hub: Bia)" },
        { kind: "plate_change", occurred_at: "2027-10-02T08:00:01Z", actor: "Bia", note: "x" },
      ],
    });
    expect(t.map((e) => e.text)).toEqual([
      "Comprada no site",
      "Placa alterada: AAA1A11 → BBB2B22 (Movepark Hub: Bia)",
      "Não gravou: placa trocada para BBB2B22 por Bia. O site recusou: Voucher usado.",
    ]);
    expect(t[2].tone).toBe("error");
  });

  it("ação do Hub depois da última cópia entra até o histórico chegar", () => {
    const t = buildWlTimeline({
      ...base,
      actions: [{ ...ok, created_at: "2027-10-02T13:00:00Z" }],
      site_events: [{ kind: "history", occurred_at: "2027-10-01T10:00:05Z", actor: "Maria", note: "Voucher gerado" }],
    });
    expect(t.map((e) => e.text)).toEqual(["Comprada no site", "Voucher gerado (Maria)", "Placa trocada para BBB2B22 por Bia"]);
  });

  it("sem histórico copiado: compra, ações do Hub e comparecimento do site", () => {
    const t = buildWlTimeline({ ...base, actions: [], site_events: [] });
    expect(t.map((e) => e.text)).toEqual(["Comprada no site", "Compareceu (marcado no site)"]);
  });
});

describe("wlPaymentMethodLabel", () => {
  it("tira o nome do gateway", () => {
    expect(wlPaymentMethodLabel("Cartão de crédito - Pagarme V5")).toBe("Cartão de crédito");
    expect(wlPaymentMethodLabel("PIX - Pagarme V5")).toBe("PIX");
    expect(wlPaymentMethodLabel("Movepark Checkout")).toBe("Movepark Checkout");
    expect(wlPaymentMethodLabel(null)).toBeNull();
  });
});
