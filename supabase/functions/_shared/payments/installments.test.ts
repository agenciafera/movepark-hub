import { assertEquals } from "jsr:@std/assert";
import {
  computeInstallmentPlan,
  DEFAULT_INSTALLMENT_POLICY,
  parseInstallmentPolicy,
  type InstallmentPolicy,
} from "./installments.ts";

Deno.test("parseInstallmentPolicy: null/garbage → defaults", () => {
  assertEquals(parseInstallmentPolicy(null), DEFAULT_INSTALLMENT_POLICY);
  assertEquals(parseInstallmentPolicy("não é json"), DEFAULT_INSTALLMENT_POLICY);
});

Deno.test("parseInstallmentPolicy: clamps coerentes (free <= max)", () => {
  const p = parseInstallmentPolicy(
    JSON.stringify({ maxInstallments: 6, interestFreeUpTo: 99, monthlyInterestPct: 3, absorb: "partner" }),
  );
  assertEquals(p.maxInstallments, 6);
  assertEquals(p.interestFreeUpTo, 6); // clampado ao teto
  assertEquals(p.monthlyInterestPct, 3);
  assertEquals(p.absorb, "partner");
});

const policy = (o: Partial<InstallmentPolicy> = {}): InstallmentPolicy => ({
  ...DEFAULT_INSTALLMENT_POLICY,
  ...o,
});

Deno.test("computeInstallmentPlan: sem juros (taxa 0) → tudo no preço base", () => {
  const plan = computeInstallmentPlan(30000, policy({ monthlyInterestPct: 0, maxInstallments: 12 }));
  assertEquals(plan.length, 12);
  for (const o of plan) {
    assertEquals(o.totalCents, 30000);
    assertEquals(o.hasInterest, false);
    assertEquals(o.interestCents, 0);
  }
  assertEquals(plan[0].installments, 1);
});

Deno.test("computeInstallmentPlan: juros ao cliente acima de N (PMT), 1..N sem juros", () => {
  const plan = computeInstallmentPlan(
    30000,
    policy({ monthlyInterestPct: 2.99, interestFreeUpTo: 3, maxInstallments: 6, absorb: "customer" }),
  );
  // 1..3 sem juros
  for (const o of plan.filter((x) => x.installments <= 3)) {
    assertEquals(o.totalCents, 30000);
    assertEquals(o.hasInterest, false);
  }
  // 4..6 com juros: total > base e total == parcela * n
  for (const o of plan.filter((x) => x.installments >= 4)) {
    assertEquals(o.hasInterest, true);
    assertEquals(o.totalCents > 30000, true);
    assertEquals(o.totalCents, o.installmentCents * o.installments);
    assertEquals(o.interestCents, o.totalCents - 30000);
  }
});

Deno.test("computeInstallmentPlan: absorb != customer → cliente paga preço fixo (sem juros exibido)", () => {
  const plan = computeInstallmentPlan(
    30000,
    policy({ monthlyInterestPct: 2.99, interestFreeUpTo: 1, maxInstallments: 6, absorb: "movepark" }),
  );
  for (const o of plan) {
    assertEquals(o.totalCents, 30000);
    assertEquals(o.hasInterest, false);
  }
});

Deno.test("computeInstallmentPlan: remove parcelas abaixo do mínimo, mantém 1x", () => {
  // base R$10, mínimo R$5 → 1x=1000, 2x=500 (ok), 3x=333 (<500, removida)…
  const plan = computeInstallmentPlan(1000, policy({ minInstallmentCents: 500, maxInstallments: 12 }));
  assertEquals(plan.map((o) => o.installments), [1, 2]);
});

Deno.test("computeInstallmentPlan: base inválido → vazio", () => {
  assertEquals(computeInstallmentPlan(0, policy()), []);
  assertEquals(computeInstallmentPlan(-5, policy()), []);
});
