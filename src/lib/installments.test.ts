import { describe, expect, it } from "vitest";
import {
  computeInstallmentPlan,
  DEFAULT_INSTALLMENT_POLICY,
  parseInstallmentPolicy,
  type InstallmentPolicy,
} from "./installments";

// Paridade com o módulo Deno (supabase/functions/_shared/payments/installments.ts) — os mesmos
// golden cases rodam dos dois lados pra travar qualquer divergência.

const policy = (o: Partial<InstallmentPolicy> = {}): InstallmentPolicy => ({
  ...DEFAULT_INSTALLMENT_POLICY,
  ...o,
});

describe("parseInstallmentPolicy", () => {
  it("null/garbage → defaults", () => {
    expect(parseInstallmentPolicy(null)).toEqual(DEFAULT_INSTALLMENT_POLICY);
    expect(parseInstallmentPolicy("não json")).toEqual(DEFAULT_INSTALLMENT_POLICY);
  });
  it("aceita objeto e string JSON; clampa free <= max", () => {
    const fromObj = parseInstallmentPolicy({ maxInstallments: 6, interestFreeUpTo: 99 });
    expect(fromObj.interestFreeUpTo).toBe(6);
    const fromStr = parseInstallmentPolicy(JSON.stringify({ absorb: "movepark", monthlyInterestPct: 2 }));
    expect(fromStr.absorb).toBe("movepark");
    expect(fromStr.monthlyInterestPct).toBe(2);
  });
});

describe("computeInstallmentPlan", () => {
  it("taxa 0 → tudo no preço base, sem juros", () => {
    const plan = computeInstallmentPlan(30000, policy({ monthlyInterestPct: 0, maxInstallments: 12 }));
    expect(plan.length).toBe(12);
    expect(plan.every((o) => o.totalCents === 30000 && !o.hasInterest)).toBe(true);
  });

  it("juros ao cliente acima de N: total > base e total == parcela*n", () => {
    const plan = computeInstallmentPlan(
      30000,
      policy({ monthlyInterestPct: 2.99, interestFreeUpTo: 3, maxInstallments: 6, absorb: "customer" }),
    );
    for (const o of plan.filter((x) => x.installments <= 3)) expect(o.hasInterest).toBe(false);
    for (const o of plan.filter((x) => x.installments >= 4)) {
      expect(o.hasInterest).toBe(true);
      expect(o.totalCents).toBeGreaterThan(30000);
      expect(o.totalCents).toBe(o.installmentCents * o.installments);
    }
  });

  it("absorb != customer → cliente paga preço fixo", () => {
    const plan = computeInstallmentPlan(
      30000,
      policy({ monthlyInterestPct: 2.99, interestFreeUpTo: 1, absorb: "movepark" }),
    );
    expect(plan.every((o) => o.totalCents === 30000 && !o.hasInterest)).toBe(true);
  });

  it("remove parcelas abaixo do mínimo, mantém 1x", () => {
    const plan = computeInstallmentPlan(1000, policy({ minInstallmentCents: 500 }));
    expect(plan.map((o) => o.installments)).toEqual([1, 2]);
  });
});
