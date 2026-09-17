// E-mail de cancelamento ao cliente (17/09/2026), com guarda de exatamente-uma-vez igual à da
// confirmação (`booking.cancellation_email_sent_at`). Chamado do `cancel-booking` depois de a
// reserva estar cancelada e o estorno decidido. Best-effort: nunca lança.

import { type CancellationRefund, getEmailConfig, sendEmail, siteUrl, tplBookingCancelled } from "./email.ts";
import { mapBookingRowToVoucher, VOUCHER_BOOKING_SELECT } from "./voucher/fields.ts";

export interface CancellationInfo {
  refund: CancellationRefund;
  /** Valor estornado em reais (o `payment.amount`), ou null sem cobrança. */
  amount: number | null;
  method: "pix" | "card" | null;
  reason: string | null;
}

/** Traduz o desfecho da Edge (refunded/pending/manual) na situação que o cliente lê. */
export function cancellationRefund(a: { refunded: boolean; refundPending: boolean; refundManual: boolean }): CancellationRefund {
  if (a.refundManual) return "manual";
  if (!a.refunded) return "none";
  return a.refundPending ? "pending" : "refunded";
}

// deno-lint-ignore no-explicit-any
export async function sendBookingCancellationEmail(admin: any, bookingId: string, info: CancellationInfo): Promise<boolean> {
  const { data: claimed } = await admin
    .from("booking")
    .update({ cancellation_email_sent_at: new Date().toISOString() })
    .eq("id", bookingId)
    .is("cancellation_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return false;

  try {
    const { data: b } = await admin
      .from("booking")
      .select(`${VOUCHER_BOOKING_SELECT}, customer_name, customer_email, profile_id`)
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) throw new Error("reserva não encontrada");

    // ADR-006: snapshot do pedido primeiro; senão a credencial em auth.users.
    let email: string | null = String(b.customer_email ?? "").trim() || null;
    let name: string | null = b.customer_name ?? null;
    if ((!email || !name) && b.profile_id) {
      if (!name) {
        const { data: p } = await admin.from("profiles").select("full_name").eq("id", b.profile_id).maybeSingle();
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

    const voucher = mapBookingRowToVoucher(b);
    const tpl = tplBookingCancelled(voucher, name, info, `${siteUrl()}/bookings/${voucher.code}`);
    const res = await sendEmail({ from, to: email, subject: tpl.subject, html: tpl.html });
    if (!res.ok) throw new Error(res.error ?? "falha no SMTP");
    return true;
  } catch (e) {
    console.error("[booking-cancellation] e-mail não enviado:", bookingId, e instanceof Error ? e.message : e);
    await admin.from("booking").update({ cancellation_email_sent_at: null }).eq("id", bookingId);
    return false;
  }
}
