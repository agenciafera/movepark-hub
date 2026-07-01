import { describe, expect, it } from "vitest";
import { bpsToPctString, isCommissionDirty, parseCommissionPct } from "./finance-commissions.logic";

describe("bpsToPctString", () => {
  it("converte basis points em porcentagem", () => {
    expect(bpsToPctString(1500)).toBe("15");
    expect(bpsToPctString(1050)).toBe("10.5");
    expect(bpsToPctString(0)).toBe("0");
    expect(bpsToPctString(10000)).toBe("100");
  });
});

describe("parseCommissionPct", () => {
  it("aceita ponto e vírgula", () => {
    expect(parseCommissionPct("15")).toEqual({ bps: 1500 });
    expect(parseCommissionPct("10,5")).toEqual({ bps: 1050 });
    expect(parseCommissionPct("12.34")).toEqual({ bps: 1234 });
    expect(parseCommissionPct("20%")).toEqual({ bps: 2000 });
  });
  it("aceita os limites 0 e 100", () => {
    expect(parseCommissionPct("0")).toEqual({ bps: 0 });
    expect(parseCommissionPct("100")).toEqual({ bps: 10000 });
  });
  it("rejeita vazio, não-número e fora da faixa", () => {
    expect(parseCommissionPct("")).toEqual({ error: "Informe a comissão." });
    expect(parseCommissionPct("abc")).toEqual({ error: "Informe um número válido." });
    expect(parseCommissionPct("-1")).toEqual({ error: "A comissão deve ficar entre 0% e 100%." });
    expect(parseCommissionPct("101")).toEqual({ error: "A comissão deve ficar entre 0% e 100%." });
  });
});

describe("isCommissionDirty", () => {
  it("detecta mudança real", () => {
    expect(isCommissionDirty(1500, "15")).toBe(false);
    expect(isCommissionDirty(1500, "15,0")).toBe(false);
    expect(isCommissionDirty(1500, "20")).toBe(true);
  });
  it("input inválido não conta como salvável", () => {
    expect(isCommissionDirty(1500, "abc")).toBe(false);
    expect(isCommissionDirty(1500, "")).toBe(false);
  });
});
