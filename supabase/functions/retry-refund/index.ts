// Edge Function: /retry-refund (17/09/2026)
// Tenta de novo, pelo gateway, um estorno que caiu na fila manual (`payout_refund_manual` em
// `pending`). Só hub_admin. Mesma regra do cancel-booking: híbrido quando o parceiro cobre, senão
// 100% master. Sucesso fecha a linha da fila (`paid`, com nota) e vira o pagamento em estornado
// (ou em processamento, no PIX assíncrono). Recusa de novo devolve 409 com o motivo e atualiza a
// resposta crua na linha. Incerteza (timeout, 5xx) devolve 502 sem tocar em nada.
//
// POST /functions/v1/retry-refund   (Authorization: Bearer <jwt hub_admin>)
// { manual_refund_id }
// → { ok, status: "refunded" | "paid", refund_pending }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { executeRefund, manualRefundReason, partnerRecipientMissing, persistPartnerBalance } from "../_shared/payments/refund.ts";
import { loadGatewaySettings } from "../_shared/payments/settings.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { sweepDebtEmails } from "../_shared/debt-email.ts";
import { parseRetryInput, retryPreflight, retryResponse } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await userClient.rpc("is_hub_admin");
  if (isAdmin !== true) return json({ error: "Só a Movepark tenta o estorno de novo." }, 403);

  let body: { manual_refund_id?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { id, error: inputErr } = parseRetryInput(body);
  if (!id) return json({ error: inputErr }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: fila } = await admin
    .from("payout_refund_manual")
    .select("id, booking_id, payment_id, amount_cents, status")
    .eq("id", id)
    .maybeSingle();

  const { data: payment } = await admin
    .from("payment")
    .select("id, provider, provider_payment_id, provider_charge_id, amount, method, status, refunded_at, refund_reason, split, split_sent_to_gateway, debt_recovered_cents, gateway_fee_cents")
    .eq("id", fila?.payment_id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  const pre = retryPreflight(fila, payment);
  if (!pre.ok || !fila || !payment) return json({ error: pre.error }, pre.status);

  let gateway;
  try {
    gateway = getGateway(payment.provider ?? "pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }
  let chargeId = payment.provider_charge_id as string | null;
  if (!chargeId && payment.provider_payment_id) {
    const charge = await gateway.getCharge(payment.provider_payment_id);
    chargeId = charge.chargeId;
  }
  if (!chargeId) return json({ error: "Não foi possível localizar a cobrança para estorno." }, 422);

  const settings = await loadGatewaySettings(admin);
  const totalCents = Math.round(Number(payment.amount) * 100);
  const exec = await executeRefund({
    gateway,
    chargeId,
    payment,
    moveparkRecipientId: settings.moveparkRecipientId,
    totalCents,
    hybridEnabled: settings.refundHybridEnabled,
    partnerRecipientMissing: await partnerRecipientMissing(admin, payment),
  });
  await persistPartnerBalance(admin, exec);
  const nowIso = new Date().toISOString();
  await logGatewayEvent(admin, {
    paymentId: payment.id,
    bookingId: fila.booking_id,
    kind: "refund",
    httpStatus: exec.result.httpStatus,
    request: { amount_cents: totalCents, split: exec.splitSent ?? null, mode: exec.mode, reason: exec.reason, retry_of: fila.id },
    response: exec.result.raw,
    note: exec.result.status === "failed"
      ? `ESTORNO RECUSADO de novo pelo gateway: ${(exec.result.failureMessages ?? []).join("; ") || "sem motivo"} · nova tentativa (fila manual)`
      : "nova tentativa pela fila manual",
  });

  const resposta = retryResponse(exec.outcome, exec.result);
  if (exec.outcome === "definitive") {
    await admin
      .from("payout_refund_manual")
      .update({ reason: manualRefundReason(exec.result.raw), gateway_response: exec.result.raw ?? null, note: `nova tentativa recusada em ${nowIso}` })
      .eq("id", fila.id);
  }
  if (!resposta.closeQueue) return json(resposta.body, resposta.http);

  const refundPending = exec.result.status !== "refunded";
  await admin
    .from("payment")
    .update({
      status: refundPending ? "paid" : "refunded",
      refunded_at: nowIso,
      refunded_amount: payment.amount,
      refund_reason: payment.refund_reason ?? "cancelamento (staff)",
      provider_charge_id: chargeId,
      refund_absorbed_by_master: exec.absorbedByMaster,
      refund_split: exec.splitSent ?? null,
      refund_partner_cents: exec.partnerCents,
      refund_partner_balance_cents: exec.partnerBalanceCents,
      ...(exec.gatewayFeeCents == null ? {} : { gateway_fee_cents: exec.gatewayFeeCents }),
    })
    .eq("id", payment.id);
  await admin
    .from("payout_refund_manual")
    .update({ status: "paid", paid_by: userData.user.id, paid_at: nowIso, note: "estornado pelo gateway numa nova tentativa" })
    .eq("id", fila.id);
  if (exec.absorbedByMaster) await sweepDebtEmails(admin);

  return json(resposta.body, resposta.http);
});
