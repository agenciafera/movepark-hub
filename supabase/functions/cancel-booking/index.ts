// Edge Function: /cancel-booking
// Cancela uma reserva e, quando aplicável, ESTORNA o pagamento via gateway (E0.3.2, ADR-004).
// A chamada de estorno exige a secret do gateway → a orquestração mora aqui (não no client).
//
// Autorização: dono da reserva (cliente) OU staff (hub_admin / company_operator da empresa).
// Política de estorno (servidor é a verdade): cliente estorna só dentro da janela de 24h (PRD-12);
// staff estorna como override. Estorno TOTAL nesta etapa. Capacidade liberada via a RPC única e
// idempotente `cancel_booking_with_release` (mesma usada pelo webhook) → nunca libera 2x.
//
// POST /functions/v1/cancel-booking
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXX", "reason"?: "..." }
// → { status: "cancelled", refunded: boolean, refund_pending: boolean, refund_manual: boolean }
//
// Estorno (E0.3.5): sai 100% do master quando a cobrança foi com split, e a perna do parceiro vira
// dívida no razão. Recusa DEFINITIVA do gateway (prazo vencido, sem saldo) não aborta mais: a
// reserva cancela, libera a vaga, e a devolução entra na fila de reembolso manual do Manager.
// Recusa incerta (rede, 5xx, rate limit) segue abortando, porque tentar de novo funciona.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { executeRefund, manualRefundReason, partnerRecipientMissing, persistPartnerBalance } from "../_shared/payments/refund.ts";
import { loadGatewaySettings } from "../_shared/payments/settings.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { sweepDebtEmails } from "../_shared/debt-email.ts";
import { cancellationRefund, sendBookingCancellationEmail } from "../_shared/booking-cancellation.ts";
import { parseCancelInput, refundDecision, type Actor } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
  const userId = userData.user.id;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseCancelInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Reserva + empresa (via location).
  const { data: booking, error: bErr } = await admin
    .from("booking")
    .select(
      "id, code, status, check_in_at, check_out_at, fare_cancel_until, profile_id, location:location!inner(company_id)",
    )
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  if (!booking) return jsonResponse({ error: "Reserva não encontrada." }, 404);

  // deno-lint-ignore no-explicit-any
  const companyId = (booking as any).location?.company_id as string | undefined;

  // Autorização: dono (customer) ou staff (hub_admin / operador da empresa).
  let actor: Actor | null = null;
  if (booking.profile_id === userId) {
    actor = "customer";
  } else {
    const { data: caller } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (caller?.role === "hub_admin") {
      actor = "staff";
    } else if (caller?.role === "company_operator" && companyId) {
      const { data: membership } = await admin
        .from("profile_company")
        .select("company_id")
        .eq("profile_id", userId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (membership) actor = "staff";
    }
  }
  if (!actor) return jsonResponse({ error: "Sem permissão para cancelar esta reserva." }, 403);

  // Último payment do booking.
  const { data: payment } = await admin
    .from("payment")
    .select("id, provider, provider_payment_id, provider_charge_id, amount, method, status, refunded_at, split, split_sent_to_gateway, debt_recovered_cents, gateway_fee_cents")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const decision = refundDecision({
    actor,
    bookingStatus: booking.status,
    paymentStatus: payment?.status ?? null,
    alreadyRefunded: !!payment?.refunded_at,
    checkInAt: booking.check_in_at,
    fareCancelUntil: booking.fare_cancel_until,
    now: new Date(),
  });

  if (decision.action === "noop") {
    return jsonResponse({ status: booking.status, refunded: false, refund_pending: false });
  }

  // Cliente fora da janela grátis da Tarifa: bloqueado (decisão PO jul/2026). Staff nunca cai aqui
  // (refundDecision já resolve como override). Nada é escrito.
  if (decision.action === "blocked") {
    return jsonResponse(
      {
        error:
          "A janela de cancelamento da sua tarifa já encerrou. Fale com o suporte para avaliar seu caso.",
        code: "cancel_window_closed",
      },
      403,
    );
  }

  let refunded = false;
  let refundPending = false;
  let refundManual = false;
  let absorvidoPeloMaster = false;

  if (decision.action === "cancel_with_refund" && payment) {
    // Resolve o charge id: coluna → fallback via getCharge(order id).
    let gateway;
    try {
      gateway = getGateway(payment.provider ?? "pagarme");
    } catch (e) {
      if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
      throw e;
    }

    let chargeId = payment.provider_charge_id as string | null;
    if (!chargeId && payment.provider_payment_id) {
      const charge = await gateway.getCharge(payment.provider_payment_id);
      chargeId = charge.chargeId;
    }
    if (!chargeId) {
      return jsonResponse({ error: "Não foi possível localizar a cobrança para estorno." }, 422);
    }

    const settings = await loadGatewaySettings(admin);
    const totalCents = Math.round(Number(payment.amount) * 100);
    const exec = await executeRefund({
      gateway,
      chargeId,
      payment,
      moveparkRecipientId: settings.moveparkRecipientId,
      totalCents,
      // E0.3.6: com a chave ligada, o gateway debita o parceiro quando o saldo dele cobre.
      hybridEnabled: settings.refundHybridEnabled,
      partnerRecipientMissing: await partnerRecipientMissing(admin, payment),
    });
    await persistPartnerBalance(admin, exec);
    await logGatewayEvent(admin, {
      paymentId: payment.id,
      bookingId: booking.id,
      kind: "refund",
      httpStatus: exec.result.httpStatus,
      request: { amount_cents: totalCents, split: exec.splitSent ?? null, mode: exec.mode, reason: exec.reason },
      response: exec.result.raw,
      // Recusa processada fica explícita no rastro: "HTTP 200" sozinho parecia estorno feito.
      note: exec.result.status === "failed"
        ? `ESTORNO RECUSADO pelo gateway: ${(exec.result.failureMessages ?? []).join("; ") || "sem motivo"} · ${input.reason ?? `cancelamento (${actor})`}`
        : input.reason ?? `cancelamento (${actor})`,
    });
    const refund = exec.result;
    const motivo = input.reason ?? `cancelamento (${actor})`;

    if (exec.outcome === "transient") {
      // Não sei se saiu: aborta sem tocar no booking, e tentar de novo faz sentido.
      console.error("[cancel-booking] estorno falhou:", refund.httpStatus, JSON.stringify(refund.raw));
      return jsonResponse({ error: "Falha ao estornar o pagamento. Tente novamente." }, 502);
    }

    if (exec.outcome === "definitive") {
      // Recusa processada (prazo do meio de pagamento vencido, saldo insuficiente no master...).
      // Insistir nunca vai funcionar. O cancelamento segue e a devolução vai para a fila manual;
      // o payment fica `paid` até alguém marcar a linha como paga no Manager.
      console.error("[cancel-booking] estorno recusado, vai para a fila manual:", refund.httpStatus, JSON.stringify(refund.raw));
      const { error: filaErr } = await admin.from("payout_refund_manual").insert({
        booking_id: booking.id,
        payment_id: payment.id,
        amount_cents: totalCents,
        reason: manualRefundReason(refund.raw),
        gateway_response: refund.raw ?? null,
        created_by: userId,
      });
      if (filaErr) {
        // Sem a linha na fila o cliente ficaria sem devolução e sem ninguém sabendo. Aí é abortar.
        console.error("[cancel-booking] fila manual falhou:", filaErr.message);
        return jsonResponse({ error: "Falha ao registrar o reembolso. Tente novamente." }, 500);
      }
      await admin
        .from("payment")
        .update({ refund_reason: motivo, provider_charge_id: chargeId })
        .eq("id", payment.id);
      refundManual = true;
    } else {
      refunded = true;
      refundPending = refund.status !== "refunded"; // PIX pode confirmar via webhook depois
      absorvidoPeloMaster = exec.absorbedByMaster === true;
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
    }
  }

  // Cancela + libera capacidade (idempotente por status). Único ponto de liberação.
  const { error: rpcErr } = await admin.rpc("cancel_booking_with_release", {
    p_booking_id: booking.id,
    p_reason: input.reason ?? `cancelamento (${actor})`,
  });
  if (rpcErr) return jsonResponse({ error: rpcErr.message }, 500);

  // Estorno pago pelo master vira dívida do parceiro: avisa na hora (a varredura do cron cobre o
  // resto). Best-effort.
  if (refunded && absorvidoPeloMaster) await sweepDebtEmails(admin);

  // O cliente fica sabendo do cancelamento e do que acontece com o dinheiro (best-effort).
  await sendBookingCancellationEmail(admin, booking.id, {
    refund: cancellationRefund({ refunded, refundPending, refundManual }),
    amount: refunded || refundManual ? Number(payment?.amount ?? 0) || null : null,
    method: payment?.method === "card" ? "card" : payment?.method === "pix" ? "pix" : null,
    reason: input.reason ?? null,
  });

  // Histórico de alteração (best-effort: não bloqueia a resposta se o log falhar).
  await admin
    .rpc("log_booking_modification", {
      p_booking_id: booking.id,
      p_type: "cancel",
      p_actor_id: userId,
      p_actor_role: actor,
      p_changes: { status: { from: booking.status, to: "cancelled" } },
      p_amount_delta_cents: refunded && payment ? -Math.round(Number(payment.amount) * 100) : null,
      p_reason: input.reason ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[cancel-booking] log_booking_modification:", error.message);
    });

  // O release Hub→WL é enfileirado pelo trigger booking_wl_release (status → cancelled) → outbox
  // wl_delivery → Edge wl-deliver (E2.5.2). Nada inline aqui.

  return jsonResponse({
    status: "cancelled",
    refunded,
    refund_pending: refundPending,
    refund_manual: refundManual,
  });
});
