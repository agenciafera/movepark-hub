import { describe, expect, it } from "vitest";
import { dateCell } from "./summary.logic";

const agora = new Date("2026-08-07T12:00:00");

describe("dateCell", () => {
  it("omite o ano quando a reserva é do ano corrente", () => {
    expect(dateCell("2026-08-07T21:00:00", agora)).toEqual({ dia: "07 ago", hora: "21:00" });
  });

  /** Reserva de dezembro conferida em janeiro seguinte não pode esconder o ano. */
  it("mostra o ano quando a reserva cai em outro ano", () => {
    expect(dateCell("2027-01-03T06:30:00", agora)).toEqual({
      dia: "03 jan 2027",
      hora: "06:30",
    });
  });

  // O locale pt-BR abrevia o mês com ponto ("ago."), que polui a célula.
  it("não deixa ponto na abreviação do mês", () => {
    expect(dateCell("2026-08-07T21:00:00", agora).dia).not.toContain(".");
    expect(dateCell("2027-08-07T21:00:00", agora).dia).not.toContain(".");
  });
});
