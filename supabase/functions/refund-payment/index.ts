// Edge Function: /refund-payment (19/10/2026)
// Estorna UM pagamento sem cancelar a reserva. Só hub_admin, pelo Manager (rastro do gateway na
// reserva). Nasceu da cobrança em dobro da MP-07DAE9: a cópia precisava voltar para a cliente com
// a reserva de pé, e o único caminho era o painel da Pagar.me, sem motivo, sem quem fez e sem o
// razão do parceiro acompanhar.
//
// Mesma contabilidade do cancelamento (`executeRefund`): híbrido quando a chave está ligada e o
// parceiro cobre, senão 100% master e a perna do parceiro vira dívida no razão. Antes de chamar o
// gateway grava `payment.refund_keeps_booking` e `refund_requested_by`: o `charge.refunded` que
// volta pelo webhook (e o reconcile-refunds) não cancela a reserva. Incerteza (timeout, 5xx) não
// grava o estorno; recusa processada vai para a fila manual (`payout_refund_manual`), como no
// cancelamento.
//
// POST /functions/v1/refund-payment   (Authorization: Bearer <jwt hub_admin>)
// { payment_id, reason }
// → 200 { ok, status: "refunded" | "paid", refund_pending }
//   409 recusa (fila manual) ou pagamento que não pode ser estornado · 502 gateway sem resposta

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { executeRefund, manualRefundReason, partnerRecipientMissing, persistPartnerBalance } from "../_shared/payments/refund.ts";
import { loadGatewaySettings } from "../_shared/payments/settings.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { sweepDebtEmails } from "../_shared/debt-email.ts";
import { parseRefundInput, refundPreflight, refundReasonText, refundResponse } from "./logic.ts";

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
  if (isAdmin !== true) return json({ error: "Só a Movepark estorna pagamento." }, 403);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { paymentId, reason, error: inputErr } = parseRefundInput(body);
  if (!paymentId || !reason) return json({ error: inputErr }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: payment } = await admin
    .from("payment")
    .select("id, booking_id, provider, provider_payment_id, provider_charge_id, amount, method, status, refunded_at, refund_reason, split, split_sent_to_gateway, debt_recovered_cents, gateway_fee_cents")
    .eq("id", paymentId)
    .maybeSingle();
  const { count: naFila } = await admin
    .from("payout_refund_manual")
    .select("id", { count: "exact", head: true })
    .eq("payment_id", paymentId)
    .eq("status", "pending");
  const pre = refundPreflight(payment, (naFila ?? 0) > 0);
  if (!pre.ok || !payment) return json({ error: pre.error }, pre.status);

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

  const motivo = refundReasonText(reason);
  const quem = userData.user.email ?? userData.user.id;

  // A marca vem ANTES do gateway: o webhook do estorno pode chegar antes desta função terminar.
  const { error: marcaErr } = await admin
    .from("payment")
    .update({ refund_keeps_booking: true, refund_requested_by: userData.user.id })
    .eq("id", payment.id);
  if (marcaErr) return json({ error: "Não consegui registrar o pedido de estorno. Nada foi estornado." }, 500);

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
  await logGatewayEvent(admin, {
    paymentId: payment.id,
    bookingId: payment.booking_id,
    kind: "refund",
    httpStatus: exec.result.httpStatus,
    request: { amount_cents: totalCents, split: exec.splitSent ?? null, mode: exec.mode, reason: exec.reason, keeps_booking: true, requested_by: quem },
    response: exec.result.raw,
    note: exec.result.status === "failed"
      ? `ESTORNO RECUSADO pelo gateway: ${(exec.result.failureMessages ?? []).join("; ") || "sem motivo"} · ${motivo} · por ${quem}`
      : `${motivo} · por ${quem}`,
  });

  const resposta = refundResponse(exec.outcome, exec.result);

  if (exec.outcome === "definitive") {
    // Recusa processada: a devolução vai para a fila manual, como no cancelamento.
    const { error: filaErr } = await admin.from("payout_refund_manual").insert({
      booking_id: payment.booking_id,
      payment_id: payment.id,
      amount_cents: totalCents,
      reason: manualRefundReason(exec.result.raw),
      gateway_response: exec.result.raw ?? null,
      created_by: userData.user.id,
    });
    if (filaErr) {
      console.error("[refund-payment] fila manual falhou:", filaErr.message);
      return json({ error: "A Pagar.me recusou o estorno e não consegui registrar na fila manual. Avise o time." }, 500);
    }
    await admin.from("payment").update({ refund_reason: motivo, provider_charge_id: chargeId }).eq("id", payment.id);
  }

  if (exec.outcome === "ok") {
    const refundPending = exec.result.status !== "refunded";
    await admin
      .from("payment")
      .update({
        status: refundPending ? "paid" : "refunded",
        refunded_at: new Date().toISOString(),
        refunded_amount: payment.amount,
        refund_reason: motivo,
        provider_charge_id: chargeId,
        refund_absorbed_by_master: exec.absorbedByMaster,
        refund_split: exec.splitSent ?? null,
        refund_partner_cents: exec.partnerCents,
        refund_partner_balance_cents: exec.partnerBalanceCents,
        ...(exec.gatewayFeeCents == null ? {} : { gateway_fee_cents: exec.gatewayFeeCents }),
      })
      .eq("id", payment.id);
    // Estorno pago pelo master vira dívida do parceiro: avisa na hora (best-effort).
    if (exec.absorbedByMaster) await sweepDebtEmails(admin);
  }

  return json(resposta.body, resposta.http);
});
