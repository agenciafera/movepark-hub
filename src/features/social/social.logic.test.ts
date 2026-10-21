import { describe, expect, it } from "vitest";
import {
  abaDoStatus,
  deCampoDeData,
  formatarDia,
  paraCampoDeData,
  partirGancho,
  podeAprovar,
} from "./social.logic";

const AGORA = new Date("2026-10-21T15:00:00Z");

describe("abaDoStatus", () => {
  it("põe o atrasado junto do que espera aprovação, e esconde o recusado", () => {
    expect(abaDoStatus("pending_review")).toBe("para-aprovar");
    expect(abaDoStatus("overdue")).toBe("para-aprovar");
    expect(abaDoStatus("approved")).toBe("agendados");
    expect(abaDoStatus("publishing")).toBe("agendados");
    expect(abaDoStatus("published")).toBe("publicados");
    expect(abaDoStatus("failed")).toBe("falhas");
    expect(abaDoStatus("rejected")).toBeNull();
  });
});

describe("partirGancho", () => {
  it("separa os 125 caracteres que aparecem antes do mais", () => {
    const legenda = "a".repeat(130);
    expect(partirGancho(legenda)).toEqual({ gancho: "a".repeat(125), resto: "aaaaa" });
  });
});

describe("podeAprovar", () => {
  const limpo = {
    status: "pending_review" as const,
    validation: { blockers: [], warnings: ["x"] },
    scheduled_at: "2026-10-22T15:00:00Z",
  };

  it("aprova post limpo com data futura, mesmo com aviso", () => {
    expect(podeAprovar(limpo, AGORA)).toEqual({ ok: true });
  });
  it("trava com bloqueio", () => {
    expect(podeAprovar({ ...limpo, validation: { blockers: ["b"], warnings: [] } }, AGORA).ok).toBe(
      false,
    );
  });
  it("trava com data passada", () => {
    expect(podeAprovar({ ...limpo, scheduled_at: "2026-10-21T14:00:00Z" }, AGORA).ok).toBe(false);
  });
  it("trava fora de pending_review", () => {
    expect(podeAprovar({ ...limpo, status: "approved" }, AGORA).ok).toBe(false);
  });
});

describe("campo de data", () => {
  it("mostra a hora de São Paulo e volta ao mesmo instante", () => {
    expect(paraCampoDeData("2026-10-28T15:00:00.000Z")).toBe("2026-10-28T12:00");
    expect(deCampoDeData("2026-10-28T12:00")).toBe("2026-10-28T15:00:00.000Z");
  });
});

describe("formatarDia", () => {
  it("escreve a data no formato brasileiro", () => {
    expect(formatarDia("2026-10-21")).toBe("21/10/2026");
  });
});
