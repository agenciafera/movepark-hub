// Emissão do link de prova de vida (KYC) e o aviso ao parceiro, compartilhados entre a Edge
// `sync-recipient` (ação do parceiro) e a `pagarme-webhook` (o gateway avisando que precisa).
//
// Por que o webhook precisa disso: o link só existe a partir de `affiliation`. No `create` o
// recebedor ainda está em `registration`, sem link nenhum, então se ninguém emitir quando o
// webhook de `affiliation` chega, o parceiro nunca é avisado e só descobre a pendência se voltar
// ao painel por conta própria.

import { getEmailConfig, sendPartnerEmail, tplKycLinkIssued } from "./email.ts";
import { getGateway } from "./payments/index.ts";

/** Status cru do gateway em que a prova de vida foi exigida e o link pode ser gerado. */
export const PROVIDER_STATUS_AWAITING_KYC = "affiliation";

/** O link vigente ainda vale? Emitir outro invalidaria o que o parceiro talvez já tenha aberto. */
export function hasLiveKycLink(
  kycUrl: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!kycUrl?.trim() || !expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return !Number.isNaN(ms) && ms > now.getTime();
}

/**
 * Avisa o parceiro que a prova de vida está pendente, UMA vez por emissão de link.
 *
 * A unicidade vem de `kyc_link_email_sent_at`, reivindicado por UPDATE condicional antes de
 * qualquer envio: dois gatilhos quase simultâneos (webhook e clique) resultam num e-mail só.
 * O e-mail leva ao painel, nunca ao link do gateway, porque esse link vale 20 minutos e chegaria
 * morto em quase todo e-mail aberto fora da hora.
 *
 * Destinatário: o contato da ficha de KYC, com o contato do onboarding como reserva.
 */
// deno-lint-ignore no-explicit-any
export async function notifyKycPending(admin: any, recipientId: string, companyId: string) {
  const { data: claimed } = await admin
    .from("payout_recipient")
    .update({ kyc_link_email_sent_at: new Date().toISOString() })
    .eq("id", recipientId)
    .is("kyc_link_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

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

  const to = kycEmail ?? ob?.contact_email ?? null;
  if (!to) return;

  const { from } = await getEmailConfig(admin);
  if (!from) return;

  const mail = tplKycLinkIssued(ob?.contact_name ?? "");
  await sendPartnerEmail(admin, { companyId, from, to, subject: mail.subject, html: mail.html });
}

/**
 * Emite um link novo no gateway, grava url e validade e avisa o parceiro. Idempotente na prática:
 * se já existe link vivo, não emite nada e devolve `false`.
 */
// deno-lint-ignore no-explicit-any
export async function issueKycLinkAndNotify(
  // deno-lint-ignore no-explicit-any
  admin: any,
  recipient: {
    id: string;
    company_id: string;
    provider: string;
    external_recipient_id: string | null;
    kyc_url: string | null;
    kyc_url_expires_at: string | null;
  },
): Promise<boolean> {
  if (!recipient.external_recipient_id) return false;
  if (hasLiveKycLink(recipient.kyc_url, recipient.kyc_url_expires_at)) return false;

  const gateway = getGateway(recipient.provider);
  const result = await gateway.getRecipient(recipient.external_recipient_id, { kycLink: true });
  if (!result.kycUrl) return false;

  await admin
    .from("payout_recipient")
    .update({
      status: result.status,
      last_provider_status: result.rawStatus,
      kyc_url: result.kycUrl,
      kyc_url_expires_at: result.kycExpiresAt,
      kyc_link_email_sent_at: null,
      requirements: result.requirements,
    })
    .eq("id", recipient.id);

  await admin.from("payout_recipient_event").insert({
    payout_recipient_id: recipient.id,
    kind: "kyc_link",
    http_status: result.httpStatus,
    request: null,
    response: result.raw,
  });

  await notifyKycPending(admin, recipient.id, recipient.company_id);
  return true;
}
