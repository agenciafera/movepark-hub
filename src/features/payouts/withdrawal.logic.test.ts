import { describe, expect, it } from "vitest";
import { brtDay, countOpenWithdrawals, withdrawalLanding, withdrawalRequestedAt } from "./withdrawal.logic";

const fmt = (iso: string) => iso.slice(0, 10);
const base = { status: "processing", requested_at: "2026-09-17T17:30:00Z", created_at: "2026-09-17T17:30:05Z", expected_at: null, paid_at: null, failure_reason: null };

describe("withdrawalLanding", () => {
  it("pago diz quando caiu", () => {
    expect(withdrawalLanding({ ...base, status: "paid", paid_at: "2026-09-18T13:05:00Z" }, fmt)).toEqual({ text: "caiu em 2026-09-18", late: false });
  });

  it("em trânsito diz a previsão; passou o dia sem cair, avisa que está atrasado", () => {
    const hoje = new Date("2026-09-18T12:00:00Z");
    expect(withdrawalLanding({ ...base, expected_at: "2026-09-19T02:59:00Z" }, fmt, hoje)).toEqual({ text: "previsto para 2026-09-19", late: false });
    const depois = new Date("2026-09-19T12:00:00Z");
    expect(withdrawalLanding({ ...base, expected_at: "2026-09-18T20:00:00Z" }, fmt, depois)).toEqual({ text: "previsto para 2026-09-18, ainda não caiu", late: true });
  });

  it("falha traz o motivo do banco; sem previsão diz isso", () => {
    expect(withdrawalLanding({ ...base, status: "failed", failure_reason: "conta encerrada" }, fmt).text).toBe("falhou: conta encerrada");
    expect(withdrawalLanding({ ...base, status: "failed" }, fmt).text).toBe("falhou no banco");
    expect(withdrawalLanding(base, fmt).text).toBe("sem previsão do gateway");
  });
});

describe("helpers", () => {
  it("brtDay converte para o dia civil de Brasília", () => {
    expect(brtDay("2026-09-19T02:59:00Z")).toBe("2026-09-18");
    expect(brtDay("2026-09-19T03:00:00Z")).toBe("2026-09-19");
  });

  it("requested_at prevalece sobre created_at; abertos são created e processing", () => {
    expect(withdrawalRequestedAt(base)).toBe("2026-09-17T17:30:00Z");
    expect(withdrawalRequestedAt({ requested_at: null, created_at: "x" })).toBe("x");
    expect(countOpenWithdrawals([{ status: "created" }, { status: "processing" }, { status: "paid" }, { status: "failed" }])).toBe(2);
  });
});
