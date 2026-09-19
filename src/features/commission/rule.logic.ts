// Lógica pura das regras de comissão por origem da venda (E0.3.12).
// Spec: docs/specs/comissao-por-origem.md. Sem React nem Supabase, para ser testável.
//
// Quem DECIDE a comissão de uma reserva é o banco (`resolve_commission`). Aqui mora só o que a
// tela precisa: ler o formulário, avisar o que a regra vai fazer e montar o link rastreado.

import type { CommissionRule } from "@/types/domain";
import { parseCommissionPct } from "@/routes/manager/finance-commissions.logic";

export type FeePayer = "movepark" | "partner";
export type ChargebackBearer = "each" | "partner" | "movepark";

export const FEE_PAYER_LABEL: Record<FeePayer, string> = {
  movepark: "Movepark paga",
  partner: "Estacionamento paga",
};

export const CHARGEBACK_LABEL: Record<ChargebackBearer, string> = {
  each: "Cada um com a sua parte",
  partner: "Estacionamento arca com tudo",
  movepark: "Movepark arca com tudo",
};

export type RuleForm = {
  id?: string;
  name: string;
  /** "" = regra global (vale para qualquer empresa). */
  companyId: string;
  utmSourcesText: string;
  matchWhiteLabel: boolean;
  takeRatePct: string;
  feePayer: FeePayer;
  chargebackBearer: ChargebackBearer;
  priority: string;
  isActive: boolean;
  /** yyyy-mm-dd, ou "" para sem limite. */
  validFrom: string;
  validUntil: string;
};

export const EMPTY_RULE_FORM: RuleForm = {
  name: "",
  companyId: "",
  utmSourcesText: "",
  matchWhiteLabel: false,
  takeRatePct: "",
  feePayer: "movepark",
  chargebackBearer: "each",
  priority: "0",
  isActive: true,
  validFrom: "",
  validUntil: "",
};

/** "Abbapark, abbapark-insta\nsite" → ["abbapark", "abbapark-insta", "site"]: igual ao trigger do banco. */
export function parseUtmSources(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const u = part.trim().toLowerCase();
    if (u) out.add(u);
  }
  return [...out].sort();
}

export type RulePayload = {
  id?: string;
  name: string;
  company_id: string | null;
  utm_sources: string[];
  match_white_label: boolean;
  take_rate_bps: number;
  gateway_fee_payer: FeePayer;
  chargeback_bearer: ChargebackBearer;
  priority: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
};

function dayStart(d: string): string | null {
  return d ? new Date(`${d}T00:00:00-03:00`).toISOString() : null;
}

/** Valida o formulário com as MESMAS regras das constraints do banco, para o erro vir antes do 400. */
export function validateRuleForm(f: RuleForm): { ok: true; payload: RulePayload } | { ok: false; error: string } {
  const name = f.name.trim();
  if (!name) return { ok: false, error: "Dê um nome à regra. Ele aparece na reserva como o canal da venda." };
  const utm = parseUtmSources(f.utmSourcesText);
  if (f.matchWhiteLabel && !f.companyId) {
    return { ok: false, error: "Site white-label é sempre de uma empresa: escolha a empresa da regra." };
  }
  if (!f.matchWhiteLabel && utm.length === 0) {
    return { ok: false, error: "Informe ao menos um utm_source, ou marque o site white-label da empresa." };
  }
  const pct = parseCommissionPct(f.takeRatePct);
  if ("error" in pct) return { ok: false, error: pct.error };
  if (pct.bps >= 10000) return { ok: false, error: "A comissão não pode consumir todo o valor da reserva." };
  const priority = Number(f.priority.trim() === "" ? "0" : f.priority);
  if (!Number.isInteger(priority)) return { ok: false, error: "Prioridade é um número inteiro." };
  const from = dayStart(f.validFrom);
  const until = dayStart(f.validUntil);
  if (from && until && until <= from) return { ok: false, error: "O fim da vigência tem que ser depois do início." };
  return {
    ok: true,
    payload: {
      ...(f.id ? { id: f.id } : {}),
      name,
      company_id: f.companyId || null,
      utm_sources: utm,
      match_white_label: f.matchWhiteLabel,
      take_rate_bps: pct.bps,
      gateway_fee_payer: f.feePayer,
      chargeback_bearer: f.chargebackBearer,
      priority,
      is_active: f.isActive,
      valid_from: from,
      valid_until: until,
    },
  };
}

export function formFromRule(r: CommissionRule): RuleForm {
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : "");
  return {
    id: r.id,
    name: r.name,
    companyId: r.company_id ?? "",
    utmSourcesText: r.utm_sources.join(", "),
    matchWhiteLabel: r.match_white_label,
    takeRatePct: String(r.take_rate_bps / 100),
    feePayer: r.gateway_fee_payer === "partner" ? "partner" : "movepark",
    chargebackBearer:
      r.chargeback_bearer === "partner" || r.chargeback_bearer === "movepark" ? r.chargeback_bearer : "each",
    priority: String(r.priority),
    isActive: r.is_active,
    validFrom: day(r.valid_from),
    validUntil: day(r.valid_until),
  };
}

export type RuleStatus = "active" | "inactive" | "scheduled" | "expired";

export function ruleStatus(r: Pick<CommissionRule, "is_active" | "valid_from" | "valid_until">, now: Date = new Date()): RuleStatus {
  if (!r.is_active) return "inactive";
  if (r.valid_until && new Date(r.valid_until) <= now) return "expired";
  if (r.valid_from && new Date(r.valid_from) > now) return "scheduled";
  return "active";
}

export const RULE_STATUS_LABEL: Record<RuleStatus, string> = {
  active: "Ativa",
  inactive: "Desligada",
  scheduled: "Agendada",
  expired: "Vencida",
};

/**
 * A taxa do gateway só sai da perna da Movepark quando a perna cobre a taxa estimada (PIX 1,5%,
 * cartão 6%: os mesmos números de `estimatedGatewayFeeCents` na Edge). Com comissão baixa a taxa
 * volta para o estacionamento, e quem cadastra a regra precisa saber disso ANTES de prometer.
 */
export function feeCoverageWarning(takeRateBps: number, feePayer: FeePayer): string | null {
  if (feePayer === "partner") return null;
  if (takeRateBps < 150) {
    return "Com essa comissão a Movepark não cobre a taxa do gateway nem no PIX: a taxa sai da parte do estacionamento em todas as vendas.";
  }
  if (takeRateBps < 600) {
    return "No cartão a taxa do gateway (cerca de 6%) passa dessa comissão: nas vendas em cartão a taxa sai da parte do estacionamento. No PIX a Movepark paga.";
  }
  return null;
}

/** Quanto cada lado recebe numa venda de exemplo, para a regra ser lida em reais. */
export function splitExample(takeRateBps: number, totalCents = 10000): { partnerCents: number; moveparkCents: number } {
  const moveparkCents = Math.round((totalCents * takeRateBps) / 10000);
  return { partnerCents: totalCents - moveparkCents, moveparkCents };
}

/** Link da página do estacionamento com o UTM da regra, para ele divulgar. */
export function trackedLink(pageUrl: string, utmSource: string, utmMedium = "parceiro"): string {
  const u = new URL(pageUrl);
  u.searchParams.set("utm_source", utmSource);
  u.searchParams.set("utm_medium", utmMedium);
  return u.toString();
}
