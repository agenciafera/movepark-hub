// Envio do e-mail de confirmação de reserva (cliente), com guarda de exatamente-uma-vez.
// Chamado do ponto de confirmação de pagamento: `pagarme-webhook` (fluxo real) e
// `mock-payment` (MVP). Best-effort: nunca lança para não derrubar o webhook.
//
// Idempotência: `booking.confirmation_email_sent_at` é reivindicado por um UPDATE condicional
// (WHERE ... IS NULL). Só quem ganha a corrida envia; se o envio falhar, o campo é limpo para
// que uma reentrega futura tente de novo.

import { getEmailConfig, sendEmail, siteUrl, tplBookingConfirmation } from "./email.ts";
import { mapBookingRowToVoucher, VOUCHER_BOOKING_SELECT } from "./voucher/fields.ts";

// deno-lint-ignore no-explicit-any
export async function sendBookingConfirmationEmail(admin: any, bookingId: string): Promise<void> {
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

    // 3. Resolve destinatário: snapshot do pedido tem prioridade; senão, credencial do auth.users.
    // ADR-006: e-mail/telefone verificados moram no auth.users, nunca no profiles.
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
    if (!email) throw new Error("sem e-mail de contato para a reserva");

    const { from } = await getEmailConfig(admin);
    if (!from) throw new Error("remetente (partner_email_from) não configurado");

    // 4. Monta e envia.
    const voucher = mapBookingRowToVoucher(b);
    const url = `${siteUrl()}/bookings/${voucher.code}`;
    const tpl = tplBookingConfirmation(voucher, name, url);
    const res = await sendEmail({ from, to: email, subject: tpl.subject, html: tpl.html });
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
