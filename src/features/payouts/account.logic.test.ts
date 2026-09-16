import { describe, expect, it } from "vitest";
import { releaseLabel, summarizeMovements, transferCycleLabel, type AccountMovement } from "./account.logic";

const base: AccountMovement = {
  kind: "sale", at: "2026-09-16T18:31:00Z", booking_code: "MP-1", gross_cents: 1440, fee_cents: 18,
  debt_recovered_cents: 0, net_cents: 1422, debt_delta_cents: 0, release_at: "2026-09-16", release_status: "released",
  origin: null, status: null, note: null,
};

describe("transferCycleLabel", () => {
  it("descreve o ciclo de transferência como o gateway o executa", () => {
    expect(transferCycleLabel({ transfer_enabled: null, transfer_interval: null, transfer_day: null })).toBe("Padrão da conta Pagar.me");
    expect(transferCycleLabel({ transfer_enabled: true, transfer_interval: "Monthly", transfer_day: 10 })).toBe("Automático, todo dia 10");
    expect(transferCycleLabel({ transfer_enabled: true, transfer_interval: "Weekly", transfer_day: 5 })).toBe("Automático, toda sexta");
    expect(transferCycleLabel({ transfer_enabled: false, transfer_interval: "Daily", transfer_day: null })).toBe("Só por saque manual");
  });
});

describe("releaseLabel", () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  it("venda liberada, a liberar com data, ou sem previsão; outras linhas ficam em branco", () => {
    expect(releaseLabel(base, fmt)).toBe("liberado");
    expect(releaseLabel({ ...base, release_status: "waiting", release_at: "2026-10-16" }, fmt)).toBe("libera em 2026-10-16");
    expect(releaseLabel({ ...base, release_status: "unknown", release_at: null }, fmt)).toBe("sem previsão");
    expect(releaseLabel({ ...base, kind: "withdrawal" }, fmt)).toBe("");
  });
});

describe("summarizeMovements", () => {
  it("separa entradas, saídas e o que mudou na dívida", () => {
    const r = summarizeMovements([
      base,
      { ...base, kind: "refund", net_cents: -1422, gross_cents: -1440 },
      { ...base, kind: "debt", net_cents: 0, debt_delta_cents: 2880 },
      { ...base, kind: "settlement", net_cents: 0, debt_delta_cents: -1000 },
    ]);
    expect(r).toEqual({ in_cents: 1422, out_cents: 1422, debt_delta: 1880 });
  });
});
