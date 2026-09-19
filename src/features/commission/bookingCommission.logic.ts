// O canal da venda e o pacote de comissão congelado numa reserva (E0.3.12), prontos para a tela.
// Lógica pura. Quem decide o pacote é o banco; aqui só se lê o que está gravado na reserva.

import { CHARGEBACK_LABEL, FEE_PAYER_LABEL, type ChargebackBearer, type FeePayer } from "./rule.logic";

export type BookingCommissionLike = {
  commission_channel?: string | null;
  commission_rule_id?: string | null;
  commission_take_rate_bps?: number | null;
  commission_fee_payer?: string | null;
  commission_chargeback_bearer?: string | null;
  commission_locked?: boolean | null;
  attribution?: unknown;
  origin?: string | null;
  utm_source?: string | null;
};

export type CommissionView = {
  /** Reserva anterior ao E0.3.12, sem pacote gravado: vale a comissão padrão da empresa. */
  legacy: boolean;
  /** Nome do canal para a tela. */
  channel: string;
  /** Veio de uma regra (true) ou é o padrão da Movepark (false). */
  fromRule: boolean;
  takeRatePct: number | null;
  feePayer: string | null;
  chargeback: string | null;
  locked: boolean;
  proof: { label: string; value: string }[];
};

const HUB_CHANNEL = "Movepark (busca e site)";

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function commissionView(b: BookingCommissionLike, formatDateTime: (iso: string) => string): CommissionView {
  const legacy = !b.commission_channel || b.commission_take_rate_bps == null;
  const fromRule = !legacy && !!b.commission_rule_id;
  const a = (b.attribution && typeof b.attribution === "object" ? b.attribution : {}) as Record<string, unknown>;

  const proof: CommissionView["proof"] = [];
  const utm = text(a.utm_source) ?? text(b.utm_source);
  if (utm) proof.push({ label: "utm_source", value: utm });
  const medium = text(a.utm_medium);
  if (medium) proof.push({ label: "utm_medium", value: medium });
  const campaign = text(a.utm_campaign);
  if (campaign) proof.push({ label: "utm_campaign", value: campaign });
  const clicked = text(a.clicked_at);
  if (clicked && !Number.isNaN(new Date(clicked).getTime())) {
    proof.push({ label: "Chegou pelo link em", value: formatDateTime(clicked) });
  }
  const landing = text(a.landing_url);
  if (landing) proof.push({ label: "Página de entrada", value: landing });
  const referrer = text(a.referrer);
  if (referrer) proof.push({ label: "Veio de", value: referrer });
  if (b.origin === "white_label") proof.push({ label: "Onde reservou", value: "Site white-label do estacionamento" });

  return {
    legacy,
    channel: legacy || !fromRule ? HUB_CHANNEL : (b.commission_channel as string),
    fromRule,
    takeRatePct: legacy ? null : (b.commission_take_rate_bps as number) / 100,
    feePayer: legacy ? null : (FEE_PAYER_LABEL[b.commission_fee_payer as FeePayer] ?? null),
    chargeback: legacy ? null : (CHARGEBACK_LABEL[b.commission_chargeback_bearer as ChargebackBearer] ?? null),
    locked: b.commission_locked === true,
    proof,
  };
}

/** O canal só pode ser corrigido antes de a cobrança ser paga: depois o split já foi ao gateway. */
export function canFixChannel(payments: { status: string }[] | null | undefined): boolean {
  return !(payments ?? []).some((p) => p.status === "paid" || p.status === "refunded");
}

/** Regras que servem para a reserva: as da empresa dela e as globais, só as não removidas. */
export function rulesForCompany<T extends { company_id: string | null; deleted_at?: string | null }>(
  rules: T[] | null | undefined,
  companyId: string | null | undefined,
): T[] {
  return (rules ?? []).filter((r) => !r.deleted_at && (r.company_id === null || r.company_id === companyId));
}
