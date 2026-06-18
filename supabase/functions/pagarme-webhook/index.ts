// Edge Function: /pagarme-webhook
// Recebe os webhooks do Pagar.me (E0.1.2/.4) e reflete o status no payment + booking.
// Autenticação: Basic auth configurado no painel do Pagar.me (secret PAGARME_WEBHOOK_BASIC_AUTH,
// formato "user:pass"). Idempotência por id do evento (tabela payment_webhook_event).
// verify_jwt = false (o Pagar.me não envia JWT do Supabase).
//
// POST /functions/v1/pagarme-webhook
// Authorization: Basic <base64(user:pass)>
// { id, type: "order.paid" | "charge.paid" | "charge.refunded" | ..., data: { ...order/charge } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargeStatusToPaymentStatus } from "../_shared/payments/index.ts";
import { mapChargeStatus } from "../_shared/payments/pagarme.ts";
import { parseWebhookEvent, verifyBasicAuth } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth básica (se configurada)
  if (!verifyBasicAuth(req.headers.get("Authorization"), Deno.env.get("PAGARME_WEBHOOK_BASIC_AUTH"))) {
    return json({ error: "Não autorizado" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const ev = parseWebhookEvent(body);
  if (!ev.eventId) return json({ error: "Evento sem id" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Idempotência: registra o evento; se já existe (23505), ignora.
  const { error: dupErr } = await admin
    .from("payment_webhook_event")
    .insert({ id: ev.eventId, provider: "pagarme", type: ev.type });
  if (dupErr) {
    if (dupErr.code === "23505") return json({ ok: true, duplicate: true });
    return json({ error: dupErr.message }, 500);
  }

  // Localiza o payment pela order; fallback pelo booking.
  let payment: { id: string; booking_id: string } | null = null;
  if (ev.orderId) {
    const { data } = await admin
      .from("payment")
      .select("id, booking_id")
      .eq("provider", "pagarme")
      .eq("provider_payment_id", ev.orderId)
      .maybeSingle();
    payment = data ?? null;
  }
  if (!payment && (ev.bookingId || ev.bookingCode)) {
    let q = admin.from("payment").select("id, booking_id, booking:booking!inner(code)").eq("provider", "pagarme");
    if (ev.bookingId) q = q.eq("booking_id", ev.bookingId);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    // deno-lint-ignore no-explicit-any
    payment = data ? { id: (data as any).id, booking_id: (data as any).booking_id } : null;
  }
  if (!payment) {
    // Ack mesmo sem casar (evita reentrega infinita); fica logado.
    console.warn("[pagarme-webhook] payment não encontrado:", ev.orderId, ev.bookingId);
    return json({ ok: true, matched: false });
  }

  const status = mapChargeStatus(ev.rawStatus ?? ev.type.split(".")[1]);
  const paymentStatus = chargeStatusToPaymentStatus(status);

  await admin
    .from("payment")
    .update({
      status: paymentStatus,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", payment.id);

  // Pagamento aprovado → confirma a reserva (só se ainda pendente).
  if (status === "paid") {
    await admin
      .from("booking")
      .update({ status: "confirmed" })
      .eq("id", payment.booking_id)
      .eq("status", "pending");
  }

  return json({ ok: true, status: paymentStatus });
});
