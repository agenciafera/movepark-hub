// Envio do e-mail de confirmação de reserva (cliente), com guarda de exatamente-uma-vez.
// Chamado do ponto de confirmação de pagamento: `pagarme-webhook` (fluxo real) e
// `mock-payment` (MVP). Best-effort: nunca lança para não derrubar o webhook.
//
// Idempotência: `booking.confirmation_email_sent_at` é reivindicado por um UPDATE condicional
// (WHERE ... IS NULL). Só quem ganha a corrida envia; se o envio falhar, o campo é limpo para
// que uma reentrega futura tente de novo.

import {
  type EmailAttachment,
  getEmailConfig,
  pdfAttachment,
  sendEmail,
  siteUrl,
  tplBookingConfirmation,
} from "./email.ts";
import {
  mapBookingRowToVoucher,
  VOUCHER_BOOKING_SELECT,
  type VoucherBooking,
  voucherFilename,
} from "./voucher/fields.ts";
import { buildVoucherPdf, voucherQrContent } from "./voucher/pdf.ts";
import { notifyBooking } from "./notify.ts";
import { activeAccessCode, holdConfirmationEmail } from "./integrations/access-code.ts";

/**
 * O voucher vai em anexo no e-mail de confirmação (02/10/2026): o cliente recebe o PDF sem
 * precisar entrar no site. É o mesmo gerador do bucket (`buildVoucherPdf`), montado de novo
 * aqui em vez de baixado do storage, porque a pré-geração do webhook corre em paralelo a este
 * envio e o arquivo pode ainda não existir. Best-effort: se o PDF falhar, o e-mail sai sem
 * anexo, como saía antes, em vez de não sair. O QR é o da cancela quando a unidade tem
 * integração (docs/specs/integracoes.md § 5.6).
 */
// deno-lint-ignore no-explicit-any
export async function voucherAttachment(admin: any, bookingId: string, voucher: VoucherBooking): Promise<EmailAttachment[]> {
  try {
    const accessCode = await activeAccessCode(admin, bookingId);
    const bytes = await buildVoucherPdf(voucher, voucherQrContent(siteUrl(), voucher.code, accessCode));
    return [pdfAttachment(voucherFilename(voucher.code), bytes)];
  } catch (e) {
    console.error("[booking-confirmation] voucher não anexado:", voucher.code, e);
    return [];
  }
}

/**
 * Destinatário do cliente: o snapshot do pedido tem prioridade; senão, a credencial do
 * auth.users. ADR-006: e-mail e telefone verificados moram no auth.users, nunca no profiles.
 */
export async function customerRecipient(
  // deno-lint-ignore no-explicit-any
  admin: any,
  b: { customer_email?: string | null; customer_name?: string | null; profile_id?: string | null },
): Promise<{ email: string | null; name: string | null }> {
  let email: string | null = String(b.customer_email ?? "").trim() || null;
  let name: string | null = b.customer_name ?? null;
  if ((!email || !name) && b.profile_id) {
    if (!name) {
      const { data: p } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", b.profile_id)
        .maybeSingle();
      name = p?.full_name ?? null;
    }
    if (!email) {
      const { data: u } = await admin.auth.admin.getUserById(b.profile_id);
      email = u?.user?.email ?? null;
    }
  }
  return { email, name };
}

// deno-lint-ignore no-explicit-any
export async function sendBookingConfirmationEmail(admin: any, bookingId: string): Promise<void> {
  // 0. Unidade com integração de cancela: o e-mail espera o código do provedor por até 15
  // minutos (decisão D4). Quem processa a entrega solta o e-mail depois (integrations/process.ts).
  if (await holdConfirmationEmail(admin, bookingId)) return;

  // 1. Reivindica o envio (exatamente-uma-vez). Service role ignora RLS.
  const { data: claimed } = await admin
    .from("booking")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", bookingId)
    .is("confirmation_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return; // já enviado, ou reserva inexistente

  try {
    // 2. Carrega os dados da reserva (mesmo select do voucher) + contato do cliente.
    const { data: b } = await admin
      .from("booking")
      .select(`${VOUCHER_BOOKING_SELECT}, customer_name, customer_email, profile_id`)
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) throw new Error("reserva não encontrada");

    // 3. Resolve destinatário.
    const { email, name } = await customerRecipient(admin, b);
    if (!email) throw new Error("sem e-mail de contato para a reserva");

    const { from } = await getEmailConfig(admin);
    if (!from) throw new Error("remetente (partner_email_from) não configurado");

    // 4. Monta e envia.
    const voucher = mapBookingRowToVoucher(b);
    const url = `${siteUrl()}/bookings/${voucher.code}`;
    const tpl = tplBookingConfirmation(voucher, name, url);
    const attachments = await voucherAttachment(admin, bookingId, voucher);
    const res = await sendEmail({ from, to: email, subject: tpl.subject, html: tpl.html, attachments });
    if (!res.ok) throw new Error(res.error ?? "falha no SMTP");
  } catch (e) {
    // Rollback da guarda: libera para retry num próximo evento de confirmação.
    await admin
      .from("booking")
      .update({ confirmation_email_sent_at: null })
      .eq("id", bookingId);
    throw e;
  }
}

/**
 * Notifica a confirmação por WhatsApp (só Flex+), pelo trilho comum dos avisos: fica registrado
 * em `notification_log` e não repete. O e-mail de confirmação tem trilho próprio acima.
 */
// deno-lint-ignore no-explicit-any
export async function notifyBookingConfirmed(admin: any, bookingId: string): Promise<void> {
  const { data: b } = await admin.from("booking").select("code").eq("id", bookingId).maybeSingle();
  if (!b) return;
  await notifyBooking(admin, {
    bookingId,
    event: "confirmed",
    whatsappParams: (c) => [c.name ?? "cliente", b.code],
  });
}
