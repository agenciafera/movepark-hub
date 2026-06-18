// Espelho (front) da lógica pura de parcelamento que vive em
// supabase/functions/_shared/payments/installments.ts. A VERDADE da cobrança é o servidor (a Edge
// create-card-charge revalida); aqui só EXIBIMOS as opções no checkout. Mantido idêntico ao Deno —
// um teste de paridade (installments.test.ts) trava qualquer divergência.

export type InstallmentAbsorb = "customer" | "movepark" | "partner";

export interface InstallmentPolicy {
  version: number;
  enabled: boolean;
  maxInstallments: number;
  interestFreeUpTo: number;
  monthlyInterestPct: number;
  minInstallmentCents: number;
  absorb: InstallmentAbsorb;
}

export interface InstallmentOption {
  installments: number;
  installmentCents: number;
  totalCents: number;
  hasInterest: boolean;
  interestCents: number;
}

export const DEFAULT_INSTALLMENT_POLICY: InstallmentPolicy = {
  version: 1,
  enabled: true,
  maxInstallments: 12,
  interestFreeUpTo: 3,
  monthlyInterestPct: 0,
  minInstallmentCents: 500,
  absorb: "customer",
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Normaliza a política (objeto OU string JSON) com defaults + clamps. */
export function parseInstallmentPolicy(raw: string | Partial<InstallmentPolicy> | null | undefined): InstallmentPolicy {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  const d = DEFAULT_INSTALLMENT_POLICY;
  const maxInstallments = clampInt(obj.maxInstallments, 1, 24, d.maxInstallments);
  return {
    version: clampInt(obj.version, 1, 9999, d.version),
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : d.enabled,
    maxInstallments,
    interestFreeUpTo: clampInt(obj.interestFreeUpTo, 1, maxInstallments, Math.min(d.interestFreeUpTo, maxInstallments)),
    monthlyInterestPct: clampNum(obj.monthlyInterestPct, 0, 100, d.monthlyInterestPct),
    minInstallmentCents: clampInt(obj.minInstallmentCents, 0, 1_000_000, d.minInstallmentCents),
    absorb: obj.absorb === "movepark" || obj.absorb === "partner" ? obj.absorb : d.absorb,
  };
}

/** Opções de parcelamento para um valor base (centavos). Idêntico ao módulo Deno. */
export function computeInstallmentPlan(baseCents: number, policy: InstallmentPolicy): InstallmentOption[] {
  const options: InstallmentOption[] = [];
  if (!Number.isInteger(baseCents) || baseCents <= 0) return options;

  const max = Math.max(1, policy.maxInstallments);
  const rate = policy.monthlyInterestPct / 100;
  const passesInterest = policy.absorb === "customer" && rate > 0;

  for (let n = 1; n <= max; n++) {
    let totalCents: number;
    let installmentCents: number;

    if (passesInterest && n > policy.interestFreeUpTo) {
      const i = rate;
      const pmt = (baseCents * i) / (1 - Math.pow(1 + i, -n));
      installmentCents = Math.round(pmt);
      totalCents = installmentCents * n;
    } else {
      totalCents = baseCents;
      installmentCents = Math.round(baseCents / n);
    }

    const interestCents = Math.max(0, totalCents - baseCents);
    if (n > 1 && installmentCents < policy.minInstallmentCents) continue;

    options.push({
      installments: n,
      installmentCents,
      totalCents,
      hasInterest: interestCents > 0,
      interestCents,
    });
  }
  return options;
}
