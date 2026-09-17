// E-mail de saque para o parceiro (E0.3.10): "está a caminho" quando o saque é pedido e "caiu na
// conta" (ou "não foi concluído") quando o gateway confirma. Quem chama: a Edge do saque, a
// conciliação (cron a cada 15 min, que também varre o que ficou para trás) e o webhook.
//
// Unicidade por UPDATE condicional em `requested_email_sent_at` / `settled_email_sent_at`: dois
// gatilhos quase simultâneos resultam num e-mail só. Falha de envio devolve o marcador para null.

import {
  getEmailConfig,
  sendPartnerEmail,
  tplWithdrawalFailed,
  tplWithdrawalPaid,
  tplWithdrawalRequested,
  type WithdrawalMail,
} from "./email.ts";

export interface WithdrawalEmailRow {
  id: string;
  company_id: string;
  amount_cents: number;
  fee_cents: number;
  status: string;
  expected_at: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  requested_email_sent_at: string | null;
  settled_email_sent_at: string | null;
  raw?: unknown;
}

export type WithdrawalEmailKind = "requested" | "settled";

const DESFECHOS = new Set(["paid", "failed", "canceled"]);

/** Quais e-mails este saque ainda deve, na ordem em que saem. Puro, para teste. */
export function withdrawalEmailsDue(row: Pick<WithdrawalEmailRow, "status" | "requested_email_sent_at" | "settled_email_sent_at">): WithdrawalEmailKind[] {
  const due: WithdrawalEmailKind[] = [];
  if (!row.requested_email_sent_at) due.push("requested");
  if (DESFECHOS.has(row.status) && !row.settled_email_sent_at) due.push("settled");
  return due;
}

/** Últimos dígitos da conta de destino, a partir do payload da transferência. */
export function accountTailFromRaw(raw: unknown): string | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ba = (r.bank_account && typeof r.bank_account === "object" ? r.bank_account : {}) as Record<string, unknown>;
  const conta = typeof ba.conta === "string" ? ba.conta : typeof ba.conta === "number" ? String(ba.conta) : "";
  if (!conta) return null;
  const dv = typeof ba.conta_dv === "string" && ba.conta_dv ? `-${ba.conta_dv}` : "";
  return `${conta.slice(-4)}${dv}`;
}

/** Contato do parceiro: e-mail da ficha de KYC, com o contato do onboarding como reserva. */
// deno-lint-ignore no-explicit-any
async function partnerContact(admin: any, companyId: string): Promise<{ to: string | null; name: string; company: string }> {
  const { data: company } = await admin.from("company").select("name").eq("id", companyId).maybeSingle();
  const { data: account } = await admin
    .from("company_payout_account")
    .select("kyc_details")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  const kyc = (account as { kyc_details: Record<string, unknown> | null } | null)?.kyc_details;
  const kycEmail = typeof kyc?.email === "string" && kyc.email.trim() ? kyc.email.trim() : null;
  const { data: onboarding } = await admin
    .from("company_onboarding")
    .select("contact_name, contact_email")
    .eq("company_id", companyId)
    .maybeSingle();
  const ob = onboarding as { contact_name: string | null; contact_email: string | null } | null;
  return {
    to: kycEmail ?? ob?.contact_email ?? null,
    name: ob?.contact_name ?? "",
    company: (company as { name: string } | null)?.name ?? "seu estacionamento",
  };
}

/**
 * Manda o que este saque ainda deve. Best-effort: nunca lança. Devolve quais e-mails saíram.
 */
// deno-lint-ignore no-explicit-any
export async function sendWithdrawalEmails(admin: any, row: WithdrawalEmailRow): Promise<WithdrawalEmailKind[]> {
  const sent: WithdrawalEmailKind[] = [];
  for (const kind of withdrawalEmailsDue(row)) {
    const col = kind === "requested" ? "requested_email_sent_at" : "settled_email_sent_at";
    try {
      const { data: claimed } = await admin
        .from("payout_withdrawal")
        .update({ [col]: new Date().toISOString() })
        .eq("id", row.id)
        .is(col, null)
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      const contato = await partnerContact(admin, row.company_id);
      const { from } = await getEmailConfig(admin);
      if (!contato.to || !from) {
        console.warn("[withdrawal-email] sem destinatário ou remetente; e-mail não enviado:", row.id, kind);
        continue;
      }
      const dados: WithdrawalMail = {
        contactName: contato.name,
        companyName: contato.company,
        amountCents: row.amount_cents,
        feeCents: row.fee_cents,
        expectedAt: row.expected_at,
        paidAt: row.paid_at,
        failureReason: row.failure_reason,
        accountTail: accountTailFromRaw(row.raw),
      };
      const mail = kind === "requested"
        ? tplWithdrawalRequested(dados)
        : row.status === "paid"
          ? tplWithdrawalPaid(dados)
          : tplWithdrawalFailed(dados);
      const r = await sendPartnerEmail(admin, { companyId: row.company_id, from, to: contato.to, subject: mail.subject, html: mail.html });
      if (r.ok) {
        sent.push(kind);
      } else if (!r.silenced) {
        // Falha de transporte: devolve o marcador para a próxima varredura tentar de novo.
        await admin.from("payout_withdrawal").update({ [col]: null }).eq("id", row.id);
        console.error("[withdrawal-email] envio falhou:", row.id, kind, r.error);
      }
    } catch (e) {
      console.error("[withdrawal-email] erro inesperado:", row.id, kind, e);
    }
  }
  return sent;
}

export const SWEEP_LIMIT = 20;

/** Varre saques com e-mail pendente (pedido ainda não avisado, ou desfecho sem aviso). */
// deno-lint-ignore no-explicit-any
export async function sweepWithdrawalEmails(admin: any): Promise<{ checked: number; sent: number }> {
  const { data, error } = await admin
    .from("payout_withdrawal")
    .select("id, company_id, amount_cents, fee_cents, status, expected_at, paid_at, failure_reason, requested_email_sent_at, settled_email_sent_at, raw")
    .is("deleted_at", null)
    .or("requested_email_sent_at.is.null,and(status.in.(paid,failed,canceled),settled_email_sent_at.is.null)")
    .order("created_at", { ascending: true })
    .limit(SWEEP_LIMIT);
  if (error) {
    console.error("[withdrawal-email] varredura falhou:", error.message);
    return { checked: 0, sent: 0 };
  }
  let sent = 0;
  for (const row of (data ?? []) as WithdrawalEmailRow[]) {
    sent += (await sendWithdrawalEmails(admin, row)).length;
  }
  return { checked: data?.length ?? 0, sent };
}
