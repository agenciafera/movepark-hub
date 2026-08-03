import { describe, expect, it } from "vitest";
import {
  detailHeadline,
  entrySteps,
  freeCancelNote,
  statusPillDetail,
} from "./bookingDetail.logic";
import type { BookingStatus } from "@/types/domain";

const AGORA = new Date(2026, 7, 3, 12, 0);

describe("detailHeadline", () => {
  it("a reserva confirmada abre dizendo que a vaga está de pé", () => {
    expect(detailHeadline("confirmed").title).toBe("Sua vaga está garantida");
  });

  /** Dizer "garantida" numa reserva cancelada seria mentir para quem abriu a tela. */
  it("cada status tem a sua manchete, sem repetir a da confirmada", () => {
    const status: BookingStatus[] = [
      "pending",
      "confirmed",
      "checked_in",
      "completed",
      "cancelled",
      "expired",
      "no_show",
    ];
    const titulos = status.map((s) => detailHeadline(s).title);
    expect(new Set(titulos).size).toBe(status.length);
    expect(detailHeadline("cancelled").title).toBe("Reserva cancelada");
    expect(detailHeadline("expired").title).toBe("Reserva expirada");
  });

  it("toda manchete vem com uma linha de apoio preenchida", () => {
    const status: BookingStatus[] = ["pending", "confirmed", "completed", "no_show"];
    for (const s of status) {
      expect(detailHeadline(s).subtitle.length).toBeGreaterThan(10);
    }
  });
});

describe("statusPillDetail", () => {
  it("conta os dias que faltam pro check-in", () => {
    expect(statusPillDetail("confirmed", new Date(2026, 7, 7, 22, 0).toISOString(), AGORA)).toBe(
      "check-in em 4 dias",
    );
  });

  it("hoje e amanhã ganham nome, não número", () => {
    expect(statusPillDetail("confirmed", new Date(2026, 7, 3, 22, 0).toISOString(), AGORA)).toBe(
      "check-in hoje",
    );
    expect(statusPillDetail("confirmed", new Date(2026, 7, 4, 8, 0).toISOString(), AGORA)).toBe(
      "check-in amanhã",
    );
  });

  /** Contagem regressiva numa reserva concluída ou cancelada não quer dizer nada. */
  it("só reserva viva mostra contagem", () => {
    const futuro = new Date(2026, 7, 7).toISOString();
    expect(statusPillDetail("completed", futuro, AGORA)).toBeNull();
    expect(statusPillDetail("cancelled", futuro, AGORA)).toBeNull();
    expect(statusPillDetail("checked_in", futuro, AGORA)).toBeNull();
  });

  it("check-in que já passou não vira contagem negativa", () => {
    expect(statusPillDetail("confirmed", new Date(2026, 7, 1).toISOString(), AGORA)).toBeNull();
  });
});

describe("entrySteps", () => {
  const base = { checkOutAt: "2026-08-09T08:00:00Z" };

  it("antes da entrada, o primeiro passo é o da vez e os outros esperam", () => {
    const s = entrySteps({ ...base, status: "confirmed" });
    expect(s.map((x) => x.state)).toEqual(["current", "next", "next"]);
  });

  /** Pintar o passo 2 como feito numa reserva que nem entrou ensinaria errado. */
  it("com check-in feito, os dois primeiros ficam prontos e a saída é a vez", () => {
    const s = entrySteps({ ...base, status: "checked_in" });
    expect(s.map((x) => x.state)).toEqual(["done", "done", "current"]);
  });

  it("estadia concluída fecha os três", () => {
    const s = entrySteps({ ...base, status: "completed" });
    expect(s.map((x) => x.state)).toEqual(["done", "done", "done"]);
  });

  it("usa a tolerância real da unidade quando ela existe", () => {
    expect(entrySteps({ ...base, status: "confirmed", toleranceMinutes: 120 })[0].text).toContain(
      "2 horas",
    );
    expect(entrySteps({ ...base, status: "confirmed", toleranceMinutes: 45 })[0].text).toContain(
      "45 minutos",
    );
    expect(entrySteps({ ...base, status: "confirmed", toleranceMinutes: 90 })[0].text).toContain(
      "1 hora e 30",
    );
  });

  /** Sem tolerância configurada, não dá pra prometer um prazo que a unidade não deu. */
  it("sem tolerância, não promete prazo", () => {
    const texto = entrySteps({ ...base, status: "confirmed", toleranceMinutes: null })[0].text;
    expect(texto).not.toMatch(/\d/);
    expect(texto).toContain("avise o estacionamento");
  });

  it("o último passo cita a data do check-out", () => {
    expect(entrySteps({ ...base, status: "confirmed" })[2].text).toContain("09 ago");
  });
});

describe("freeCancelNote", () => {
  it("mostra o prazo quando ele ainda está aberto", () => {
    const nota = freeCancelNote(new Date(2026, 7, 5, 22, 0).toISOString(), AGORA);
    expect(nota).toContain("Cancelamento grátis até");
    expect(nota).toContain("22:00");
  });

  /** Prazo vencido vira promessa falsa: some. */
  it("prazo vencido não vira frase", () => {
    expect(freeCancelNote(new Date(2026, 7, 1).toISOString(), AGORA)).toBeNull();
  });

  it("sem prazo, não inventa", () => {
    expect(freeCancelNote(null, AGORA)).toBeNull();
  });
});
