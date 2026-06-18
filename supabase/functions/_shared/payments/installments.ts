// Política de parcelamento de cartão + cálculo das opções (lógica pura, testável sem rede).
// A POLÍTICA é configurável no Manager (app_setting.card_installment_policy). A VERDADE da cobrança
// é o servidor: a Edge create-card-charge recalcula o valor financiado e revalida a parcela escolhida.
// O front tem um espelho deste módulo (src/lib/installments.ts) só para EXIBIR as opções.

export interface InstallmentPolicy {
  version: number;
  /** Liga/desliga a oferta de cartão parcelado. */
  enabled: boolean;
  /** Teto absoluto de parcelas. */
  maxInstallments: number;
  /** 1..N sem juros (N >= 1; 1 = à vista sempre sem juros). */
  interestFreeUpTo: number;
  /** Juros a.m. (%) aplicado ACIMA de interestFreeUpTo quando absorb='customer' (PMT/Price). */
  monthlyInterestPct: number;
  /** Valor mínimo por parcela (centavos) — opções abaixo disso são removidas. */
  minInstallmentCents: number;
  /** Quem paga o juros: customer (juros no preço) | movepark | partner (preço fixo ao cliente). */
  absorb: "customer" | "movepark" | "partner";
}

export interface InstallmentOption {
  installments: number;
  /** Valor de cada parcela em centavos (exibição). */
  installmentCents: number;
  /** Total cobrado do cliente em centavos (financiado quando há juros ao cliente). */
  totalCents: number;
  hasInterest: boolean;
  /** totalCents - baseCents (0 quando o cliente não paga juros). */
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

/** Lê a política do app_setting (JSON string), aplicando defaults e clamps coerentes. */
export function parseInstallmentPolicy(raw: string | null | undefined): InstallmentPolicy {
  let obj: Record<string, unknown> = {};
  if (raw && typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }
  const d = DEFAULT_INSTALLMENT_POLICY;
  const maxInstallments = clampInt(obj.maxInstallments, 1, 24, d.maxInstallments);
  return {
    version: clampInt(obj.version, 1, 9999, d.version),
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : d.enabled,
    maxInstallments,
    // interestFreeUpTo nunca passa do teto de parcelas
    interestFreeUpTo: clampInt(obj.interestFreeUpTo, 1, maxInstallments, Math.min(d.interestFreeUpTo, maxInstallments)),
    monthlyInterestPct: clampNum(obj.monthlyInterestPct, 0, 100, d.monthlyInterestPct),
    minInstallmentCents: clampInt(obj.minInstallmentCents, 0, 1_000_000, d.minInstallmentCents),
    absorb:
      obj.absorb === "movepark" || obj.absorb === "partner" ? obj.absorb : d.absorb,
  };
}

/**
 * Opções de parcelamento para um valor base (centavos). Juros (PMT/Price) só quando
 * absorb='customer' e a parcela está acima de interestFreeUpTo com taxa > 0. Nos demais modos o
 * cliente paga o preço fixo (totalCents = baseCents) e o juros, se houver, é custo interno (split).
 * Sempre inclui 1x; remove opções com parcela abaixo de minInstallmentCents (exceto 1x).
 */
export function computeInstallmentPlan(
  baseCents: number,
  policy: InstallmentPolicy,
): InstallmentOption[] {
  const options: InstallmentOption[] = [];
  if (!Number.isInteger(baseCents) || baseCents <= 0) return options;

  const max = Math.max(1, policy.maxInstallments);
  const rate = policy.monthlyInterestPct / 100;
  const passesInterest = policy.absorb === "customer" && rate > 0;

  for (let n = 1; n <= max; n++) {
    let totalCents: number;
    let installmentCents: number;

    if (passesInterest && n > policy.interestFreeUpTo) {
      // PMT (Price): parcela = base * i / (1 - (1+i)^-n); total = parcela * n
      const i = rate;
      const pmt = (baseCents * i) / (1 - Math.pow(1 + i, -n));
      installmentCents = Math.round(pmt);
      totalCents = installmentCents * n;
    } else {
      totalCents = baseCents;
      installmentCents = Math.round(baseCents / n);
    }

    const interestCents = Math.max(0, totalCents - baseCents);
    // filtra parcelas pequenas, mas 1x é sempre ofertada
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
