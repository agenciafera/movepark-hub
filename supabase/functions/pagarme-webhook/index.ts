// Edge Function: /pagarme-webhook
// Recebe os webhooks do Pagar.me (E0.1.2/.4) e reflete o status no payment + booking.
// Autenticação: Basic auth configurado no painel do Pagar.me (secret PAGARME_WEBHOOK_BASIC_AUTH,
// formato "user:pass"), comparado em tempo constante e EXIGIDO em produção (sk_live_).
// Idempotência por id do evento (tabela payment_webhook_event).
// verify_jwt = false (o Pagar.me não envia JWT do Supabase).
// No `pago`: confirma a reserva e pré-gera o voucher (service role, pós-resposta).
//
// POST /functions/v1/pagarme-webhook
// Authorization: Basic <base64(user:pass)>
// { id, type: "order.paid" | "charge.paid" | "charge.refunded" | ..., data: { ...order/charge } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargeStatusToPaymentStatus } from "../_shared/payments/index.ts";
import { mapChargeStatus } from "../_shared/payments/pagarme.ts";
import { generateAndStoreVoucher } from "../_shared/voucher/pdf.ts";
import { sendWhatsAppTemplate } from "../_shared/whatsapp.ts";
import {
  parseTransferEvent,
  parseWebhookEvent,
  transferStatusToWithdrawalStatus,
  verifyBasicAuth,
} from "./logic.ts";

/**
 * Notifica a confirmação por WhatsApp — só Tarifas Flex+ (`fare_benefits.notifications_sms`).
 * Best-effort: degrada sem config/template e nunca derruba o webhook.
 */
// deno-lint-ignore no-explicit-any
async function notifyBookingConfirmed(admin: any, bookingId: string): Promise<void> {
  const { data: b } = await admin
    .from("booking")
    .select("code, customer_name, customer_phone, profile_id, fare_benefits")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || !b.fare_benefits?.notifications_sms) return;

  let phone: string | null = b.customer_phone ?? null;
  let name: string | null = b.customer_name ?? null;
  if ((!phone || !name) && b.profile_id) {
    const { data: p } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", b.profile_id)
      .maybeSingle();
    phone = phone ?? p?.phone ?? null;
    name = name ?? p?.full_name ?? null;
  }
  if (!phone) return;

  // @ts-expect-error - Deno env
  const template = Deno.env.get("WHATSAPP_BOOKING_CONFIRMED_TEMPLATE") ?? "";
  await sendWhatsAppTemplate({
    to: phone,
    template,
    bodyParams: [name ?? "cliente", b.code],
  });
}

/** Em produção (chave sk_live_) o webhook exige Basic auth; em staging (sk_test_) é opcional. */
function isProduction(): boolean {
  return (Deno.env.get("PAGARME_SECRET_KEY") ?? "").startsWith("sk_live_");
}

/** Agenda uma tarefa pós-resposta (não bloqueia o 2xx); cai pra await se indisponível. */
async function runAfterResponse(task: Promise<unknown>): Promise<void> {
  // @ts-ignore - EdgeRuntime existe no runtime do Supabase
  const waitUntil = typeof EdgeRuntime !== "undefined" ? EdgeRuntime?.waitUntil : undefined;
  if (typeof waitUntil === "function") waitUntil(task);
  else await task;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth básica: exigida em produção (fail-closed), opcional em staging.
  if (
    !verifyBasicAuth(
      req.headers.get("Authorization"),
      Deno.env.get("PAGARME_WEBHOOK_BASIC_AUTH"),
      isProduction(),
    )
  ) {
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

  // Evento de transferência (saque do recebedor → banco do parceiro): registra em
  // payout_withdrawal (E0.3.3). Idempotente por (provider, external_transfer_id).
  if (ev.type.startsWith("transfer.")) {
    const tr = parseTransferEvent(body);
    if (!tr.transferId || !tr.recipientId) return json({ ok: true, matched: false });

    const { data: rec } = await admin
      .from("payout_recipient")
      .select("company_id")
      .eq("provider", "pagarme")
      .eq("external_recipient_id", tr.recipientId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rec) {
      console.warn("[pagarme-webhook] transfer sem recebedor casado:", tr.recipientId);
      return json({ ok: true, matched: false });
    }

    const wStatus = transferStatusToWithdrawalStatus(tr.rawStatus ?? ev.type.split(".")[1]);
    let feeCents = tr.feeCents;
    if (feeCents == null) {
      const { data: feeSetting } = await admin
        .from("app_setting")
        .select("value")
        .eq("key", "payout_withdrawal_fee_cents")
        .maybeSingle();
      feeCents = Number(feeSetting?.value ?? 0) || 0;
    }

    const nowIso = new Date().toISOString();
    const row: Record<string, unknown> = {
      company_id: rec.company_id,
      provider: "pagarme",
      external_transfer_id: tr.transferId,
      external_recipient_id: tr.recipientId,
      amount_cents: tr.amountCents ?? 0,
      fee_cents: feeCents,
      status: wStatus,
      raw: body,
    };
    if (wStatus === "created") row.requested_at = nowIso;
    if (wStatus === "paid") row.paid_at = nowIso;

    const { error: wErr } = await admin
      .from("payout_withdrawal")
      .upsert(row, { onConflict: "provider,external_transfer_id" });
    if (wErr) return json({ error: wErr.message }, 500);
    return json({ ok: true, withdrawal: wStatus });
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

  // Preserva paid_at: um pagamento pago e depois estornado mantém a data do pagamento
  // (necessário para a reconciliação por período — E0.3.3).
  const paymentPatch: Record<string, unknown> = { status: paymentStatus };
  if (status === "paid") paymentPatch.paid_at = new Date().toISOString();
  await admin.from("payment").update(paymentPatch).eq("id", payment.id);

  // Pagamento aprovado → confirma a reserva (só se ainda pendente) e emite o voucher.
  if (status === "paid") {
    await admin
      .from("booking")
      .update({ status: "confirmed" })
      .eq("id", payment.booking_id)
      .eq("status", "pending");

    // Pré-gera o voucher (server-side, service role) sem segurar o 2xx do webhook.
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "https://hub.movepark.co";
    await runAfterResponse(
      generateAndStoreVoucher(admin, payment.booking_id, siteUrl).catch((e) =>
        console.error("[pagarme-webhook] falha ao gerar voucher:", payment!.booking_id, e),
      ),
    );

    // Notificação de confirmação por WhatsApp (Tarifa Flex+) — best-effort, pós-resposta.
    await runAfterResponse(
      notifyBookingConfirmed(admin, payment.booking_id).catch((e) =>
        console.error("[pagarme-webhook] falha ao notificar confirmação:", payment!.booking_id, e),
      ),
    );
  }

  // Estorno confirmado pelo gateway (E0.3.2): reflete no payment e garante booking cancelado +
  // capacidade liberada. Idempotente: a RPC é noop se o booking já está cancelado (ex.: a Edge
  // cancel-booking iniciou o estorno) e o coalesce preserva o que ela já marcou.
  if (status === "refunded") {
    const { data: pay } = await admin
      .from("payment")
      .select("amount, refunded_at, refunded_amount")
      .eq("id", payment.id)
      .maybeSingle();
    await admin
      .from("payment")
      .update({
        refunded_at: pay?.refunded_at ?? new Date().toISOString(),
        refunded_amount: pay?.refunded_amount ?? pay?.amount ?? null,
      })
      .eq("id", payment.id);

    const { error: rpcErr } = await admin.rpc("cancel_booking_with_release", {
      p_booking_id: payment.booking_id,
      p_reason: "estorno confirmado pelo gateway",
    });
    if (rpcErr) {
      console.error("[pagarme-webhook] cancel_booking_with_release falhou:", rpcErr.message);
    }
  }

  return json({ ok: true, status: paymentStatus });
});
