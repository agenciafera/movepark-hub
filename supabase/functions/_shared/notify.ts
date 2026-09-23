// Avisos ao cliente, num trilho só (23/09/2026). Spec: docs/specs/tarifas-operacao.md (fase 2).
//
// Regra: WhatsApp para quem tem o benefício `notifications_sms` E o template está configurado
// (aprovado na Meta e no segredo); senão, ou quando o envio falha, cai para e-mail, porque o
// cliente pagou pelo aviso e não pelo canal. Cada tentativa fica em `notification_log`, com chave
// (reserva, evento, canal), então reprocessar um evento não manda duas vezes.

import { sendWhatsAppTemplate } from "./whatsapp.ts";
import { getEmailConfig, sendEmail } from "./email.ts";

export type NotifyEvent =
  | "confirmed"
  | "reminder_checkin"
  | "reminder_checkout"
  | "cancelled"
  | "dates_changed"
  | "vehicle_changed"
  | "extended";

/** Nome do segredo com o template da Meta para cada evento. */
export const WHATSAPP_TEMPLATE_ENV: Record<NotifyEvent, string> = {
  confirmed: "WHATSAPP_BOOKING_CONFIRMED_TEMPLATE",
  reminder_checkin: "WHATSAPP_BOOKING_REMINDER_TEMPLATE",
  reminder_checkout: "WHATSAPP_BOOKING_CHECKOUT_TEMPLATE",
  cancelled: "WHATSAPP_BOOKING_CANCELLED_TEMPLATE",
  dates_changed: "WHATSAPP_BOOKING_CHANGED_TEMPLATE",
  vehicle_changed: "WHATSAPP_BOOKING_CHANGED_TEMPLATE",
  extended: "WHATSAPP_BOOKING_EXTENDED_TEMPLATE",
};

export type ChannelPlan = { whatsapp: boolean; emailFallback: boolean };

/**
 * Decide os canais. Pura, para teste: WhatsApp só com benefício e template; o e-mail entra como
 * queda quando o WhatsApp não vai (ou não pode ir) e há e-mail montado.
 */
export function planChannels(a: {
  hasBenefit: boolean;
  templateConfigured: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  alreadySentWhatsApp: boolean;
  alreadySentEmail: boolean;
}): ChannelPlan {
  const whatsapp = a.hasBenefit && a.templateConfigured && a.hasPhone && !a.alreadySentWhatsApp;
  const emailFallback = a.hasEmail && !a.alreadySentEmail && !a.alreadySentWhatsApp;
  return { whatsapp, emailFallback };
}

export type Contact = { name: string | null; phone: string | null; email: string | null };

/** Contato do cliente: snapshot da reserva, senão a credencial do auth.users (ADR-006). */
// deno-lint-ignore no-explicit-any
export async function bookingContact(admin: any, b: { customer_name?: string | null; customer_phone?: string | null; customer_email?: string | null; profile_id?: string | null }): Promise<Contact> {
  let name: string | null = b.customer_name ?? null;
  let phone: string | null = b.customer_phone ?? null;
  let email: string | null = String(b.customer_email ?? "").trim() || null;
  if ((!phone || !email || !name) && b.profile_id) {
    if (!name) {
      const { data: p } = await admin.from("profiles").select("first_name, full_name").eq("id", b.profile_id).maybeSingle();
      name = p?.first_name ?? p?.full_name ?? null;
    }
    if (!phone || !email) {
      const { data: u } = await admin.auth.admin.getUserById(b.profile_id);
      if (!phone) {
        const raw = u?.user?.phone ?? null;
        phone = raw ? (raw.startsWith("+") ? raw : `+${raw}`) : null;
      }
      if (!email) email = u?.user?.email ?? null;
    }
  }
  return { name, phone, email };
}

export interface NotifyArgs {
  bookingId: string;
  event: NotifyEvent;
  /** Parâmetros do corpo do template (a ordem é a do template aprovado na Meta). */
  whatsappParams: (c: Contact) => string[];
  /** E-mail de queda (ou único canal, para quem não tem o benefício). Sem ele, só WhatsApp. */
  email?: (c: Contact) => { subject: string; html: string } | null;
}

export type NotifyResult = { whatsapp: "sent" | "failed" | "skipped"; email: "sent" | "failed" | "skipped" };

/**
 * Manda o aviso de um evento para o cliente de uma reserva, registrando cada canal. Nunca lança:
 * aviso não pode derrubar a operação que o gerou.
 */
// deno-lint-ignore no-explicit-any
export async function notifyBooking(admin: any, args: NotifyArgs): Promise<NotifyResult> {
  const out: NotifyResult = { whatsapp: "skipped", email: "skipped" };
  try {
    const { data: b } = await admin
      .from("booking")
      .select("id, code, customer_name, customer_phone, customer_email, profile_id, fare_benefits")
      .eq("id", args.bookingId)
      .maybeSingle();
    if (!b) return out;
    const { data: logs } = await admin
      .from("notification_log")
      .select("channel, status")
      .eq("booking_id", args.bookingId)
      .eq("event", args.event);
    const sent = (ch: string) => (logs ?? []).some((l: { channel: string; status: string }) => l.channel === ch && l.status === "sent");
    const contact = await bookingContact(admin, b);
    const template = (Deno.env.get(WHATSAPP_TEMPLATE_ENV[args.event]) ?? "").trim();
    const mail = args.email ? args.email(contact) : null;
    const plan = planChannels({
      hasBenefit: b.fare_benefits?.notifications_sms === true,
      templateConfigured: !!template,
      hasPhone: !!contact.phone,
      hasEmail: !!contact.email && !!mail,
      alreadySentWhatsApp: sent("whatsapp"),
      alreadySentEmail: sent("email"),
    });

    let whatsappOk = false;
    if (plan.whatsapp && contact.phone) {
      const r = await sendWhatsAppTemplate({ to: contact.phone, template, bodyParams: args.whatsappParams(contact) });
      whatsappOk = r.ok;
      out.whatsapp = r.ok ? "sent" : "failed";
      await admin.from("notification_log").upsert(
        { booking_id: args.bookingId, event: args.event, channel: "whatsapp", destination: contact.phone, status: out.whatsapp, error: r.error ?? null },
        { onConflict: "booking_id,event,channel" },
      );
    }
    if (!whatsappOk && plan.emailFallback && mail && contact.email) {
      const { from } = await getEmailConfig(admin);
      if (!from) throw new Error("remetente (partner_email_from) não configurado");
      const r = await sendEmail({ from, to: contact.email, subject: mail.subject, html: mail.html });
      out.email = r.ok ? "sent" : "failed";
      await admin.from("notification_log").upsert(
        { booking_id: args.bookingId, event: args.event, channel: "email", destination: contact.email, status: out.email, error: r.error ?? null },
        { onConflict: "booking_id,event,channel" },
      );
    }
  } catch (e) {
    console.error("[notify] aviso não enviado:", args.event, args.bookingId, e);
  }
  return out;
}
