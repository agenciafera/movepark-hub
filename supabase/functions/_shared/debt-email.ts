// E-mail de dívida para o parceiro (17/09/2026): quando a Movepark paga o estorno do master e a
// parte dele vira abatimento. Uma vez por cobrança, reivindicando `payment.debt_email_sent_at`
// antes do envio. Quem chama: a varredura do cron (reconcile-payout-transfers) e o cancel-booking.

import { getEmailConfig, sendPartnerEmail, tplPartnerDebtCreated } from "./email.ts";

export interface DebtEmailRow {
  id: string;
  amount: number | string;
  refunded_amount: number | string | null;
  refund_reason: string | null;
  gateway_fee_cents: number | null;
  split: unknown;
  booking: { code: string; location: { company_id: string } | null } | null;
}

type Rule = Record<string, unknown>;

/** Mesma regra de `public.split_rule_is_partner`: role = partner, ou (sem role) liable = true. */
export function isPartnerRule(r: Rule): boolean {
  if (typeof r.role === "string") return r.role === "partner";
  return r.liable === true;
}

/**
 * Quanto esta cobrança acrescentou à dívida: perna do parceiro, menos a taxa que ele pagou na
 * captura (quando a perna dele tem charge_processing_fee), vezes a fração estornada. É a conta de
 * `public.payout_debt_cents`, em TS, para o e-mail não depender de uma RPC que o service_role
 * não chama.
 */
export function debtFromPayment(p: Pick<DebtEmailRow, "amount" | "refunded_amount" | "gateway_fee_cents" | "split">): number {
  const rules = (Array.isArray(p.split) ? p.split : []) as Rule[];
  const partner = rules.filter(isPartnerRule);
  const leg = partner.reduce((acc, r) => acc + (typeof r.amount === "number" ? r.amount : Number(r.amount) || 0), 0);
  const paysFee = partner.some((r) => r.chargeProcessingFee === true);
  const fee = paysFee ? Math.max(0, p.gateway_fee_cents ?? 0) : 0;
  const amount = Number(p.amount) || 0;
  const refunded = Number(p.refunded_amount) || 0;
  const ratio = amount > 0 ? Math.min(1, refunded / amount) : 0;
  return Math.round(Math.max(0, leg - fee) * ratio);
}

// deno-lint-ignore no-explicit-any
async function partnerContact(admin: any, companyId: string) {
  const { data: company } = await admin.from("company").select("name").eq("id", companyId).maybeSingle();
  const { data: account } = await admin
    .from("company_payout_account").select("kyc_details").eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  const kyc = (account as { kyc_details: Record<string, unknown> | null } | null)?.kyc_details;
  const kycEmail = typeof kyc?.email === "string" && kyc.email.trim() ? kyc.email.trim() : null;
  const { data: onboarding } = await admin
    .from("company_onboarding").select("contact_name, contact_email").eq("company_id", companyId).maybeSingle();
  const ob = onboarding as { contact_name: string | null; contact_email: string | null } | null;
  return {
    to: kycEmail ?? ob?.contact_email ?? null,
    name: ob?.contact_name ?? "",
    company: (company as { name: string } | null)?.name ?? "seu estacionamento",
  };
}

/** Manda o e-mail desta cobrança, se ainda não foi. Best-effort: nunca lança. */
// deno-lint-ignore no-explicit-any
export async function sendDebtEmail(admin: any, row: DebtEmailRow): Promise<boolean> {
  const companyId = row.booking?.location?.company_id;
  if (!companyId || !row.booking) return false;
  try {
    const { data: claimed } = await admin
      .from("payment")
      .update({ debt_email_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("debt_email_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) return false;

    const debtCents = debtFromPayment(row);
    if (debtCents <= 0) return false; // nada a abater: o marcador fica, não há o que avisar

    const contato = await partnerContact(admin, companyId);
    const { from } = await getEmailConfig(admin);
    if (!contato.to || !from) {
      console.warn("[debt-email] sem destinatário ou remetente; e-mail não enviado:", row.id);
      return false;
    }
    const { data: total } = await admin.rpc("payout_debt_cents", { p_company_id: companyId });
    const mail = tplPartnerDebtCreated({
      contactName: contato.name,
      companyName: contato.company,
      bookingCode: row.booking.code,
      debtCents,
      totalDebtCents: Math.max(0, Number(total ?? debtCents) || debtCents),
      reason: row.refund_reason,
    });
    const r = await sendPartnerEmail(admin, { companyId, from, to: contato.to, subject: mail.subject, html: mail.html });
    if (r.ok) return true;
    if (!r.silenced) {
      await admin.from("payment").update({ debt_email_sent_at: null }).eq("id", row.id);
      console.error("[debt-email] envio falhou:", row.id, r.error);
    }
    return false;
  } catch (e) {
    console.error("[debt-email] erro inesperado:", row.id, e);
    return false;
  }
}

export const SWEEP_LIMIT = 20;

/** Cobranças estornadas pelo master ainda sem aviso ao parceiro. */
// deno-lint-ignore no-explicit-any
export async function sweepDebtEmails(admin: any): Promise<{ checked: number; sent: number }> {
  const { data, error } = await admin
    .from("payment")
    .select("id, amount, refunded_amount, refund_reason, gateway_fee_cents, split, booking:booking_id(code, location:location_id(company_id))")
    .eq("provider", "pagarme")
    .eq("kind", "booking")
    .is("refund_absorbed_by_master", true)
    .is("debt_email_sent_at", null)
    .eq("split_sent_to_gateway", true)
    .gt("refunded_amount", 0)
    .order("refunded_at", { ascending: true })
    .limit(SWEEP_LIMIT);
  if (error) {
    console.error("[debt-email] varredura falhou:", error.message);
    return { checked: 0, sent: 0 };
  }
  let sent = 0;
  for (const row of (data ?? []) as DebtEmailRow[]) {
    if (await sendDebtEmail(admin, row)) sent += 1;
  }
  return { checked: data?.length ?? 0, sent };
}
