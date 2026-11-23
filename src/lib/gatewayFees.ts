// Tabela de taxas do gateway (23/11/2026): o que foi contratado com a Pagar.me, cadastrado no
// Manager e guardado só no banco (`app_setting.gateway_fee_schedule`, is_public = false). O repo
// é público e a proposta comercial tem sigilo: nenhuma taxa real aparece aqui nem nos testes.
// Percentuais em bps inteiros (250 = 2,50%), para não carregar ponto flutuante.
// Spec: docs/specs/taxas-da-reserva.md

export interface FeeBand {
  from: number;
  to: number;
  bps: number;
}

export interface GatewayFeeSchedule {
  version: number;
  pix_bps: number;
  card: FeeBand[];
  antifraud_cents: number;
  /** Taxa fixa do gateway por transação, em centavos. */
  processing_cents?: number;
  /**
   * Custo efetivo total para receber em 30 dias (taxa do cartão mais antecipação), de 1x a 12x:
   * índice 0 é 1x. É a coluna "recebimento em 30 dias" da tabela da Pagar.me.
   */
  cet30_bps?: number[];
}

/** O que a RPC `gateway_fee_measured` devolve: somas por método e número de parcelas. */
export interface GatewayFeeMeasuredRow {
  method: string;
  installments: number;
  sales: number;
  charged_cents: number;
  fee_cents: number;
  fraud_cents: number;
}

export interface GatewayFeeMeasured {
  days: number;
  rows: GatewayFeeMeasuredRow[];
  anticipation: {
    payables: number;
    fee_cents: number;
    base_cents_month: number;
    monthly_bps: number | null;
  };
}

export const MAX_FEE_BPS = 2000;
/** O custo em 30 dias do 12x passa de 20%: o teto dele é outro. */
export const MAX_CET_BPS = 5000;
/** Diferença a partir da qual o efetivo "não bate" com o contratado: 0,05 ponto percentual. */
export const FEE_TOLERANCE_BPS = 5;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const faltam = (a: number, b: number) =>
  a === b ? `Falta a parcela de ${a}x.` : `Faltam as parcelas de ${a}x a ${b}x.`;

/** Por que a tabela não vale, ou null quando vale. A mesma regra serve ao formulário e à leitura. */
export function validateGatewayFeeSchedule(s: GatewayFeeSchedule): string | null {
  if (!isInt(s.pix_bps) || s.pix_bps < 0 || s.pix_bps > MAX_FEE_BPS)
    return "Taxa do Pix fora de 0% a 20%.";
  if (!isInt(s.antifraud_cents) || s.antifraud_cents < 0)
    return "Antifraude precisa ser um valor em reais não negativo.";
  if (!Array.isArray(s.card) || s.card.length === 0) return "Cadastre ao menos uma faixa do cartão.";
  let expected = 1;
  for (const b of s.card) {
    if (!isInt(b.from) || !isInt(b.to) || b.from > b.to)
      return `Faixa ${b.from}x a ${b.to}x inválida.`;
    if (expected === 1 && b.from !== 1) return "A primeira faixa começa em 1x.";
    if (b.from > expected) return faltam(expected, b.from - 1);
    if (b.from < expected) return `A faixa que começa em ${b.from}x se sobrepõe à anterior.`;
    if (b.to > 12) return "As faixas passam de 12x.";
    if (!isInt(b.bps) || b.bps < 0 || b.bps > MAX_FEE_BPS)
      return `Taxa da faixa ${b.from}x a ${b.to}x fora de 0% a 20%.`;
    expected = b.to + 1;
  }
  if (expected !== 13) return faltam(expected, 12);
  if (s.processing_cents != null && (!isInt(s.processing_cents) || s.processing_cents < 0))
    return "Taxa do gateway por transação precisa ser um valor em reais não negativo.";
  if (s.cet30_bps != null) {
    if (!Array.isArray(s.cet30_bps) || s.cet30_bps.length !== 12)
      return "Preencha o custo em 30 dias de 1x a 12x.";
    const vazio = s.cet30_bps.findIndex((b) => !Number.isFinite(b));
    if (vazio >= 0) return `Preencha o custo em 30 dias de ${vazio + 1}x.`;
    const fora = s.cet30_bps.findIndex((b) => !isInt(b) || b < 0 || b > MAX_CET_BPS);
    if (fora >= 0) return `Custo em 30 dias de ${fora + 1}x fora de 0% a 50%.`;
  }
  return null;
}

/** Lê `app_setting.gateway_fee_schedule`. Ausente, quebrado ou inválido: null ("não cadastrado"). */
export function parseGatewayFeeSchedule(raw: string | null | undefined): GatewayFeeSchedule | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const card = Array.isArray(o.card)
    ? (o.card as Record<string, unknown>[]).map(
        (b) => ({ from: b?.from, to: b?.to, bps: b?.bps }) as FeeBand,
      )
    : [];
  const s: GatewayFeeSchedule = {
    version: isInt(o.version) ? o.version : 1,
    pix_bps: o.pix_bps as number,
    card: [...card].sort((a, b) => Number(a.from) - Number(b.from)),
    antifraud_cents: o.antifraud_cents as number,
  };
  if (o.processing_cents !== undefined) s.processing_cents = o.processing_cents as number;
  if (o.cet30_bps !== undefined) s.cet30_bps = o.cet30_bps as number[];
  return validateGatewayFeeSchedule(s) ? null : s;
}

/** Custo em 30 dias do contrato para uma venda de N parcelas; null sem tabela ou fora de 1 a 12. */
export function cet30For(
  schedule: GatewayFeeSchedule | null,
  installments: number | null | undefined,
): number | null {
  if (!schedule?.cet30_bps || installments == null || installments < 1 || installments > 12)
    return null;
  return schedule.cet30_bps[installments - 1] ?? null;
}

/** A faixa do cartão em que uma venda de N parcelas cai. */
export function bandFor(
  schedule: GatewayFeeSchedule | null,
  installments: number | null | undefined,
): FeeBand | null {
  if (!schedule || installments == null) return null;
  return schedule.card.find((b) => installments >= b.from && installments <= b.to) ?? null;
}

/** MDR efetivo medido numa faixa: soma das taxas sobre a soma do cobrado. Sem venda, bps nulo. */
export function measuredForBand(
  m: GatewayFeeMeasured | null | undefined,
  method: "card" | "pix",
  from: number,
  to: number,
): { sales: number; bps: number | null } {
  const rows = (m?.rows ?? []).filter(
    (r) => r.method === method && r.installments >= from && r.installments <= to,
  );
  const sales = rows.reduce((a, r) => a + r.sales, 0);
  const charged = rows.reduce((a, r) => a + r.charged_cents, 0);
  const fee = rows.reduce((a, r) => a + r.fee_cents, 0);
  return {
    sales,
    bps: sales > 0 && charged > 0 ? Math.round((fee * 1_000_000) / charged) / 100 : null,
  };
}

/** Antifraude médio por venda medido, em centavos, sobre todas as vendas do período. */
export function measuredAntifraudCents(m: GatewayFeeMeasured | null | undefined): number | null {
  const rows = m?.rows ?? [];
  const sales = rows.reduce((a, r) => a + r.sales, 0);
  if (!sales) return null;
  return Math.round(rows.reduce((a, r) => a + r.fraud_cents, 0) / sales);
}

export function differsFromContract(
  measuredBps: number | null,
  contractBps: number | null,
): boolean {
  if (measuredBps == null || contractBps == null) return false;
  return Math.abs(measuredBps - contractBps) > FEE_TOLERANCE_BPS;
}

/** 250 → "2,50%". */
export function formatBps(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return "-";
  return `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Texto do formulário ("2,5" ou "2.5") em centésimos: bps para percentual, centavos para reais. */
export function parseHundredths(v: string): number {
  const t = v.trim();
  const n = Number(t.replace(",", "."));
  return t === "" || !Number.isFinite(n) ? Number.NaN : Math.round(n * 100);
}
