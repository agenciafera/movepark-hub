/**
 * Faturamento por empresa com as duas origens lado a lado (reservas-unificadas-hub-wl.md § 6, D4):
 * o que o Hub vendeu (receita, comissão pela `take_rate_bps`, repasse) e o que o site white-label
 * vendeu (pago no site, comissão pela `wl_take_rate_bps`). Empresa que só vendeu no site também
 * entra. Comissão do site nula = taxa ainda não combinada, e ela não soma no total (não vira zero).
 */
import type { CompanyFinance } from "./api";
import type { WlRevenue } from "./wlRevenue";

export type BillingRow = {
  companyId: string;
  companyName: string;
  hubReservations: number;
  hubGross: number;
  hubTakeRateBps: number;
  hubCommission: number;
  hubPayout: number;
  wlPaid: number;
  wlPaidAmount: number;
  wlTakeRateBps: number | null;
  wlCommission: number | null;
};

export type BillingTotals = {
  gross: number;
  hubGross: number;
  wlGross: number;
  commission: number;
  hubCommission: number;
  wlCommission: number;
  /** Empresas com venda no site e sem comissão de white-label combinada. */
  wlWithoutRate: number;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function billingRows(hub: CompanyFinance[], wl: WlRevenue["by_company"]): BillingRow[] {
  const map = new Map<string, BillingRow>();
  const vazio = (id: string, name: string): BillingRow => ({
    companyId: id,
    companyName: name,
    hubReservations: 0,
    hubGross: 0,
    hubTakeRateBps: 0,
    hubCommission: 0,
    hubPayout: 0,
    wlPaid: 0,
    wlPaidAmount: 0,
    wlTakeRateBps: null,
    wlCommission: null,
  });
  for (const h of hub) {
    const r = vazio(h.companyId, h.companyName);
    r.hubReservations = h.reservations;
    r.hubGross = h.grossRevenue;
    r.hubTakeRateBps = h.takeRateBps;
    r.hubCommission = round2((h.grossRevenue * h.takeRateBps) / 10000);
    r.hubPayout = round2(h.grossRevenue - r.hubCommission);
    map.set(h.companyId, r);
  }
  for (const w of wl) {
    const r = map.get(w.company_id) ?? vazio(w.company_id, w.company_name);
    r.wlPaid = w.paid;
    r.wlPaidAmount = w.paid_amount;
    r.wlTakeRateBps = w.wl_take_rate_bps;
    r.wlCommission = w.commission;
    map.set(w.company_id, r);
  }
  return Array.from(map.values()).sort((a, b) => b.hubGross + b.wlPaidAmount - (a.hubGross + a.wlPaidAmount));
}

export function billingTotals(rows: BillingRow[]): BillingTotals {
  const hubGross = round2(rows.reduce((a, r) => a + r.hubGross, 0));
  const wlGross = round2(rows.reduce((a, r) => a + r.wlPaidAmount, 0));
  const hubCommission = round2(rows.reduce((a, r) => a + r.hubCommission, 0));
  const wlCommission = round2(rows.reduce((a, r) => a + (r.wlCommission ?? 0), 0));
  return {
    gross: round2(hubGross + wlGross),
    hubGross,
    wlGross,
    commission: round2(hubCommission + wlCommission),
    hubCommission,
    wlCommission,
    wlWithoutRate: rows.filter((r) => r.wlPaidAmount > 0 && r.wlTakeRateBps == null).length,
  };
}
