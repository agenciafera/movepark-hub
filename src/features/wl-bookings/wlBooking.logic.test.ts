import { describe, expect, it } from "vitest";
import { attendanceLabel, canMarkArrived, centsToReais, wlActionTimelineLabel, wlBookingStatusLabel, wlBookingStatusTone } from "./wlBooking.logic";

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
