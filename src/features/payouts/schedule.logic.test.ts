import { describe, expect, it } from "vitest";
import { lastCycleLabel, manualWithdrawCaption, scheduleHeadline } from "./schedule.logic";

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const base = {
  company_id: "c1", enabled: true, day: 10, source: "global" as const, next_at: "2026-10-10",
  forecast_cents: 14133, min_cents: 5000, below_min: false, recipient_status: "active", recipient_missing: false, last_cycle: null,
};

describe("scheduleHeadline", () => {
  it("diz a data, o valor previsto e que não tem taxa", () => {
    const h = scheduleHeadline(base, brl, true);
    expect(h.value).toBe("R$ 141,33");
    expect(h.caption).toMatch(/10 de out/);
    expect(h.caption).toMatch(/sem taxa para você/);
    expect(h.tone).toBe("ok");
  });
  it("abaixo do mínimo avisa que acumula", () => {
    const h = scheduleHeadline({ ...base, forecast_cents: 1200, below_min: true }, brl, true);
    expect(h.caption).toMatch(/abaixo de R\$ 50,00/);
    expect(h.caption).toMatch(/acumula para o mês seguinte/);
    expect(h.tone).toBe("muted");
  });
  it("desligado: parceiro fala com a Movepark, Manager vê o motivo", () => {
    expect(scheduleHeadline({ ...base, enabled: false }, brl, true).caption).toMatch(/fale com a Movepark/);
    expect(scheduleHeadline({ ...base, enabled: false, source: "company" }, brl, false).caption).toMatch(/desligado para esta empresa/);
  });
  it("recebedor faltando: avisa antes de prometer data", () => {
    expect(scheduleHeadline({ ...base, recipient_missing: true }, brl, true).tone).toBe("warn");
  });
});

describe("lastCycleLabel", () => {
  it("resume o último ciclo", () => {
    expect(lastCycleLabel({ ...base, last_cycle: { cycle_month: "2026-09-01", outcome: "paid", amount_cents: 4633, available_cents: 5000, ran_at: "2026-09-10T12:00:00Z", reason: null } }, brl)).toBe("Último repasse automático em 10/09/2026: R$ 46,33 enviados ao banco.");
    expect(lastCycleLabel({ ...base, last_cycle: { cycle_month: "2026-09-01", outcome: "below_min", amount_cents: null, available_cents: 1200, ran_at: "2026-09-10T12:00:00Z", reason: "x" } }, brl)).toBe("Em 10/09/2026 não saiu: R$ 12,00 disponíveis, abaixo do mínimo. Acumula.");
    expect(lastCycleLabel(base, brl)).toBeNull();
  });
});

describe("manualWithdrawCaption", () => {
  it("deixa a taxa e a alternativa grátis claras", () => {
    expect(manualWithdrawCaption(367, 10, brl)).toBe("Saque manual: a Pagar.me cobra R$ 3,67 do seu saldo. O repasse automático do dia 10 não tem taxa para você.");
  });
});
