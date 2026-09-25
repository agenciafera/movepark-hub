// Edge Function: /open-support-ticket
// Chamado de atendimento aberto pelo cliente de dentro da reserva (25/09/2026).
// Ver docs/specs/chamado-de-atendimento.md
//
// 1. Confere que a reserva é do cliente do JWT e grava `support_ticket` (código CH-XXXXXX).
// 2. Pede ao beast-bots (`/inbox`, ação `abrir-chamado`) para abrir a conversa do cliente no
//    WhatsApp já marcada como chamado: o agente fica mudo até uma pessoa devolver. A fala do
//    cliente e a confirmação entram na conversa.
// 3. Manda ao cliente o template `movepark_chamado_aberto` (WHATSAPP_SUPPORT_TICKET_TEMPLATE).
// 4. Avisa a equipe por e-mail (`app_setting.support_inbox`), com resposta ao cliente no replyTo.
// Sem telefone, o cliente recebe a confirmação por e-mail e a equipe responde por e-mail.
//
// POST /functions/v1/open-support-ticket   Authorization: Bearer <JWT do cliente>
//   { booking_code, kind: "complaint"|"question"|"other", message }
// → { code, whatsapp: boolean }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppTemplate, toWhatsAppNumber } from "../_shared/whatsapp.ts";
import { getEmailConfig, sendEmail, tplSupportTicketCustomer, tplSupportTicketTeam } from "../_shared/email.ts";
import { siteUrl } from "../_shared/site.ts";
import { confirmationText, firstNameOf, KIND_LABEL, parseTicketInput } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k) ?? "";
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Faça login para abrir um chamado." }, 401);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !auth?.user) return json({ error: "Sessão inválida." }, 401);
  const user = auth.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = parseTicketInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { booking_code, kind, message } = parsed.input;

  const { data: booking } = await admin
    .from("booking")
    .select("id, code, profile_id, customer_name, customer_phone, customer_email, location:location(name)")
    .eq("code", booking_code)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!booking) return json({ error: "Reserva não encontrada." }, 404);

  const phone = toWhatsAppNumber(user.phone || booking.customer_phone || null);
  const email = (user.email || booking.customer_email || "").trim() || null;
  const firstName = firstNameOf(booking.customer_name);
  const unitName = (booking.location as { name?: string } | null)?.name ?? "";

  const { data: ticket, error: insErr } = await admin
    .from("support_ticket")
    .insert({ booking_id: booking.id, profile_id: user.id, kind, message, phone, email })
    .select("id, code")
    .single();
  if (insErr || !ticket) return json({ error: insErr?.message ?? "Falha ao abrir o chamado." }, 400);

  const confirmation = confirmationText(firstName, booking.code, ticket.code);
  let threadId: string | null = null;
  let whatsappSent = false;

  if (phone) {
    // 2. Conversa no beast-bots, já assumida por 'chamado'.
    const base = env("MASTRA_BASE_URL").replace(/\/+$/, "");
    const token = env("MASTRA_ADMIN_TOKEN");
    if (base && token) {
      try {
        const r = await fetch(`${base}/inbox`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: "abrir-chamado",
            agentId: "movepark-hub",
            telefone: phone,
            texto: `${KIND_LABEL[kind]}: ${message}`,
            chamado: ticket.code,
            reserva: booking.code,
            nome: booking.customer_name ?? "",
            confirmacao: confirmation,
          }),
        });
        const data = (await r.json().catch(() => ({}))) as { ok?: boolean; threadId?: string; error?: string };
        if (r.ok && data.ok) threadId = data.threadId ?? null;
        else console.error("[open-support-ticket] beast-bots recusou:", r.status, data.error);
      } catch (e) {
        console.error("[open-support-ticket] beast-bots indisponível:", e);
      }
    } else {
      console.warn("[open-support-ticket] MASTRA_BASE_URL/MASTRA_ADMIN_TOKEN ausentes: conversa não aberta");
    }

    // 3. Template ao cliente. Nunca lança.
    const template = env("WHATSAPP_SUPPORT_TICKET_TEMPLATE").trim();
    if (template) {
      const r = await sendWhatsAppTemplate({ to: phone, template, bodyParams: [firstName, booking.code, ticket.code] });
      whatsappSent = r.ok;
    }
  }

  // 4. Equipe por e-mail; cliente por e-mail quando o WhatsApp não saiu.
  let notifiedAt: string | null = null;
  try {
    const { from } = await getEmailConfig(admin);
    const { data: setting } = await admin.from("app_setting").select("value").eq("key", "support_inbox").maybeSingle();
    const inbox = (setting?.value ?? "").trim() || null;
    if (from && inbox) {
      const mail = tplSupportTicketTeam({
        ticketCode: ticket.code,
        kindLabel: KIND_LABEL[kind],
        message,
        bookingCode: booking.code,
        customerName: booking.customer_name ?? "",
        phone,
        email,
        unitName,
        whatsappSent,
      });
      const r = await sendEmail({ from, to: inbox, subject: mail.subject, html: mail.html, replyTo: email ?? undefined });
      if (r.ok) notifiedAt = new Date().toISOString();
      else console.error("[open-support-ticket] e-mail à equipe falhou:", r.error);
    }
    if (from && email && !whatsappSent) {
      const mail = tplSupportTicketCustomer(firstName, booking.code, ticket.code, `${siteUrl()}/bookings/${booking.code}`);
      await sendEmail({ from, to: email, subject: mail.subject, html: mail.html });
    }
  } catch (e) {
    console.error("[open-support-ticket] e-mail falhou:", e);
  }

  await admin
    .from("support_ticket")
    .update({ thread_id: threadId, whatsapp_sent: whatsappSent, notified_at: notifiedAt })
    .eq("id", ticket.id);

  console.log(`[open-support-ticket] ${ticket.code} reserva=${booking.code} uid=${user.id} whatsapp=${whatsappSent} thread=${threadId ?? "-"}`);
  return json({ code: ticket.code, whatsapp: whatsappSent });
});
