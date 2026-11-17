// Edge Function: /change-booking-dates-paid
// Altera as datas de uma reserva PAGA (confirmed), cobrando ou devolvendo a diferença (E2.8-h).
// Gateado pelo benefício `date_change` (Flex+); a equipe (staff) faz override em qualquer tarifa.
//
// Regra de 17/11/2026 (substitui "re-preço a preço atual" de jul/2026, docs/specs/booking-modifications.md §8):
//   - a diferença sai da TABELA DA COMPRA (RPC reprice_booking_dates): mudar só o dia não custa nada;
//   - encurtar segue a tabela (pode cobrar, num pacote);
//   - a diferença é da vaga: divide como a reserva e entra no extrato do estacionamento; a tarifa
//     nunca é cobrada nem devolvida aqui;
//   - o cupom continua.
//
//   dry_run      → 200 { mode: "quote", ...cotação }: a prévia que a tela e a Mia mostram.
//   delta = 0    → aplica na hora.
//   delta < 0    → aplica na hora + ESTORNO PARCIAL da diferença na cobrança da reserva. Sai do
//                  estacionamento a parte dele das diárias devolvidas e da Movepark a comissão delas.
//                  Recusa do gateway não desfaz a troca: a devolução vai para a fila manual do Manager.
//   delta > 0    → segura a vaga nova + PIX da diferença (dividido como a reserva); aplica no webhook,
//                  com a cotação gravada no pagamento. No cartão, o cliente paga pela Edge
//                  create-card-charge com `date_change` (mesmo caminho de split e antifraude do checkout).
//
// POST /functions/v1/change-booking-dates-paid
// Authorization: Bearer <JWT>
// { booking_code, check_in_at, check_out_at, dry_run?, expected_delta_cents? }
// → 200 { mode: "quote", ... } | 200 { mode: "applied", delta, total_amount, refunded, refund_pending, refund_manual }
//   | 201 { mode: "charge", payment_id, qr_code, qr_code_url, expires_at, delta }
//   | 409 { code: "quote_changed", ... } quando o valor mudou desde a prévia.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSplit,
  chargeStatusToPaymentStatus,
  getGateway,
  GatewayConfigError,
  pixExpiresInSeconds,
} from "../_shared/payments/index.ts";
import { effectiveSplitEnabled } from "../_shared/payments/split.ts";
import { customerTypeFor, isValidChargeDocument } from "../_shared/payments/documents.ts";
import { executeRefund, manualRefundReason, partnerRecipientMissing, persistPartnerBalance } from "../_shared/payments/refund.ts";
import { loadGatewaySettings } from "../_shared/payments/settings.ts";
import { parseBrPhone } from "../_shared/payments/contact.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { type BookingCommissionColumns, commissionForCharge } from "../_shared/payments/commission.ts";
import {
  cancelPendingDateChanges,
  chargeSplitBase,
  type DateChangeQuote,
  nextPartnerRefundFrac,
  notifyDatesChanged,
  partnerLegCents,
  partnerShareOfRefundCents,
  quoteView,
} from "../_shared/payments/date-change.ts";
import { parseChangeDatesPaidInput, quoteChanged, refundableCents } from "./logic.ts";

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

const BOOKING_COLS =
  "id, code, status, check_in_at, fare_benefits, profile_id, location_id, " +
  "commission_rule_id, commission_channel, commission_take_rate_bps, commission_fee_payer, commission_chargeback_bearer, " +
  "commission_installments_max, commission_installments_interest_free, commission_anticipation_payer, " +
  "customer_name, customer_first_name, customer_last_name, customer_email, customer_phone, customer_tax_id, " +
  "location:location!inner(company_id)";

interface BookingRow extends BookingCommissionColumns {
  id: string;
  code: string;
  status: string;
  check_in_at: string;
  fare_benefits: Record<string, unknown> | null;
  profile_id: string;
  location_id: string;
  customer_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_tax_id: string | null;
  location: { company_id: string } | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Autenticação necessária" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
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
  const { input, error: inputErr } = parseChangeDatesPaidInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const { data: bookingRow, error: bErr } = await admin
    .from("booking")
    .select(BOOKING_COLS)
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  if (!bookingRow) return jsonResponse({ error: "Reserva não encontrada." }, 404);
  const booking = bookingRow as unknown as BookingRow;

  // Autorização: dono ou equipe (hub_admin, ou membro da empresa da unidade).
  const companyId = booking.location?.company_id;
  const isOwner = booking.profile_id === userId;
  let isStaff = false;
  if (!isOwner) {
    const { data: caller } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (caller?.role === "hub_admin") {
      isStaff = true;
    } else if (companyId) {
      const { data: m } = await admin
        .from("profile_company")
        .select("company_id")
        .eq("profile_id", userId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (m) isStaff = true;
    }
    if (!isStaff) return jsonResponse({ error: "Sem permissão para alterar esta reserva." }, 403);
  }
  const actorRole = isStaff ? "staff" : "customer";

  if (booking.status !== "confirmed") {
    return jsonResponse(
      { error: "Este fluxo é para reserva paga. Reserva pendente altera datas em /change-booking-dates." },
      400,
    );
  }
  if (new Date(booking.check_in_at) <= new Date()) {
    return jsonResponse({ error: "A reserva já começou." }, 400);
  }
  const benefits = (booking.fare_benefits ?? {}) as Record<string, unknown>;
  if (!isStaff && benefits.date_change !== true) {
    return jsonResponse(
      { error: "Sua Tarifa não permite alterar datas. Faça upgrade para Flex ou Superflex." },
      403,
    );
  }

  // Cotação (só leitura): a mesma conta para a prévia, a cobrança e a gravação.
  const { data: quoteRaw, error: qErr } = await admin.rpc("reprice_booking_dates", {
    p_booking_id: booking.id,
    p_check_in: input.checkInAt,
    p_check_out: input.checkOutAt,
  });
  if (qErr) return jsonResponse({ error: qErr.message }, 400);
  const quote = quoteRaw as DateChangeQuote;
  const view = quoteView(quote);
  if (!quote.available || quote.delta_cents == null) {
    return jsonResponse({ error: quote.reason ?? "Datas indisponíveis.", ...view }, 409);
  }
  const deltaCents = quote.delta_cents;

  if (input.dryRun) {
    return jsonResponse({
      mode: "quote",
      ...view,
      // Cartão é do próprio cliente, na tela dele; a equipe gera PIX e manda o copia-e-cola.
      card_allowed: isOwner && deltaCents > 0,
    });
  }
  if (quoteChanged(input.expectedDeltaCents, deltaCents)) {
    return jsonResponse(
      { error: "O valor mudou desde a cotação. Confira o novo valor antes de confirmar.", code: "quote_changed", ...view },
      409,
    );
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }

  // Comissão congelada na reserva (E0.3.12): divide a diferença e o estorno como a vaga foi paga.
  const { data: company } = await admin
    .from("company")
    .select("take_rate_bps, gateway_split_enabled")
    .eq("id", companyId)
    .maybeSingle();
  const commission = commissionForCharge(booking, company?.take_rate_bps);

  // ── delta <= 0: aplica na hora (segura a vaga nova aqui) ──────────────────────
  if (deltaCents <= 0) {
    const refundCents = -deltaCents;

    // A cobrança que paga a reserva, e quanto ainda dá para devolver dela. Sem ela não troca: aplicar
    // a data mais curta sem ter de onde devolver deixaria o cliente sem a diferença.
    const { data: payment } = await admin
      .from("payment")
      .select("id, provider, provider_payment_id, provider_charge_id, refunded_amount, amount, method, split, split_sent_to_gateway, debt_recovered_cents, gateway_fee_cents, date_change_refunded_cents, date_change_partner_refund_frac")
      .eq("booking_id", booking.id)
      .eq("kind", "booking")
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (refundCents > 0 && (!payment || refundableCents(payment.amount, payment.refunded_amount) < refundCents)) {
      return jsonResponse(
        { error: "Não achei o pagamento desta reserva para devolver a diferença. Fale com a Movepark antes de alterar." },
        409,
      );
    }

    // Troca nova vence a anterior: anula PIX de diferença ainda aberto e solta a vaga dele.
    await cancelPendingDateChanges(admin, gateway, booking.id);

    const { data: applied, error: aErr } = await admin.rpc("apply_paid_date_change", {
      p_booking_id: booking.id,
      p_check_in: input.checkInAt,
      p_check_out: input.checkOutAt,
      p_actor_id: userId,
      p_acquire: true,
      p_actor_role: actorRole,
      p_quote: quote,
    });
    if (aErr) return jsonResponse({ error: aErr.message }, 409);

    let refunded = false;
    let refundPending = false;
    let refundManual = false;
    if (refundCents > 0 && payment) {
      // Parte do estacionamento nas diárias devolvidas; o resto (a comissão) sai da Movepark.
      const share = partnerShareOfRefundCents(quote.partner_base_delta_cents ?? deltaCents, commission.takeRateBps);
      const dcCols = {
        date_change_refunded_cents: Number(payment.date_change_refunded_cents ?? 0) + refundCents,
        date_change_partner_refund_frac: nextPartnerRefundFrac(
          Number(payment.date_change_partner_refund_frac ?? 0),
          share,
          partnerLegCents(payment.split),
        ),
      };

      let chargeId = payment.provider_charge_id as string | null;
      if (!chargeId && payment.provider_payment_id) {
        const charge = await gateway.getCharge(payment.provider_payment_id);
        chargeId = charge.chargeId;
      }
      const settings = await loadGatewaySettings(admin);
      const exec = chargeId
        ? await executeRefund({
          gateway,
          chargeId,
          payment,
          moveparkRecipientId: settings.moveparkRecipientId,
          totalCents: Math.round(Number(payment.amount) * 100),
          amountCents: refundCents,
          hybridEnabled: settings.refundHybridEnabled,
          partnerRecipientMissing: await partnerRecipientMissing(admin, payment),
        })
        : null;
      if (exec) {
        await persistPartnerBalance(admin, exec);
        await logGatewayEvent(admin, {
          paymentId: payment.id,
          bookingId: booking.id,
          kind: "refund",
          httpStatus: exec.result.httpStatus,
          request: {
            amount_cents: refundCents,
            partner_share_cents: share,
            split: exec.splitSent ?? null,
            mode: exec.mode,
            reason: exec.reason,
          },
          response: exec.result.raw,
          note: exec.outcome === "ok"
            ? "estorno parcial por troca de datas"
            : `ESTORNO RECUSADO na troca de datas, vai para a fila manual: ${(exec.result.failureMessages ?? []).join("; ") || "sem motivo"}`,
        });
      }

      if (exec?.outcome === "ok") {
        refunded = true;
        refundPending = exec.result.status !== "refunded";
        await admin
          .from("payment")
          .update({
            refunded_amount: (Number(payment.refunded_amount ?? 0) * 100 + refundCents) / 100,
            refunded_at: new Date().toISOString(),
            provider_charge_id: chargeId,
            refund_absorbed_by_master: exec.absorbedByMaster,
            refund_split: exec.splitSent ?? null,
            refund_partner_cents: exec.partnerCents,
            refund_partner_balance_cents: exec.partnerBalanceCents,
            ...(exec.gatewayFeeCents == null ? {} : { gateway_fee_cents: exec.gatewayFeeCents }),
            ...dcCols,
          })
          .eq("id", payment.id);
      } else {
        // A troca já valeu e não se desfaz por causa do gateway: a devolução vai para a fila manual
        // do Manager, como no cancelamento. Sem a linha, o cliente ficaria sem a diferença e
        // ninguém saberia.
        const { data: pendente } = await admin
          .from("payout_refund_manual")
          .select("id, amount_cents")
          .eq("payment_id", payment.id)
          .eq("status", "pending")
          .maybeSingle();
        const motivo = exec ? manualRefundReason(exec.result.raw) : "gateway_refused";
        const { error: filaErr } = pendente
          ? await admin
            .from("payout_refund_manual")
            .update({ amount_cents: Number(pendente.amount_cents) + refundCents, reason: motivo, gateway_response: exec?.result.raw ?? null })
            .eq("id", pendente.id)
          : await admin.from("payout_refund_manual").insert({
            booking_id: booking.id,
            payment_id: payment.id,
            amount_cents: refundCents,
            reason: motivo,
            gateway_response: exec?.result.raw ?? null,
            created_by: userId,
          });
        if (filaErr) console.error("[change-booking-dates-paid] fila manual falhou:", filaErr.message);
        // A parte de cada um fica gravada já; vale para o extrato quando a equipe marcar como pago.
        await admin.from("payment").update(dcCols).eq("id", payment.id);
        refundManual = true;
      }

      await admin.rpc("log_booking_modification", {
        p_booking_id: booking.id,
        p_type: "refund",
        p_actor_id: userId,
        p_actor_role: actorRole,
        p_changes: { partner_share_cents: share, manual: refundManual },
        p_amount_delta_cents: deltaCents, // negativo (estorno)
        p_reason: refundManual
          ? "estorno parcial da troca de datas na fila manual (gateway recusou)"
          : "estorno parcial (alteração de datas mais barata)",
      });
    }

    await notifyDatesChanged(admin, booking.id, refundCents > 0
      ? { refundedCents: refundCents, refundManual, method: payment?.method === "card" ? "card" : "pix" }
      : null);

    return jsonResponse({
      mode: "applied",
      delta: deltaCents / 100,
      total_amount: (applied as { total_amount?: number })?.total_amount ?? null,
      refunded,
      refund_pending: refundPending,
      refund_manual: refundManual,
    });
  }

  // ── delta > 0: segura a vaga nova + cobra o delta por PIX (aplica no webhook) ──
  const payerName =
    [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim() ||
    booking.customer_name ||
    "Cliente Movepark";
  const { data: authUser } = await admin.auth.admin.getUserById(booking.profile_id);
  const email = booking.customer_email ?? authUser?.user?.email ?? null;
  if (!email) return jsonResponse({ error: "Cliente sem e-mail para a cobrança." }, 422);
  if (!isValidChargeDocument(booking.customer_tax_id)) {
    return jsonResponse({ error: "Cliente sem CPF/CNPJ válido para o PIX." }, 422);
  }
  const phone = parseBrPhone(booking.customer_phone);
  if (!phone) return jsonResponse({ error: "Cliente sem telefone (com DDD) para o PIX." }, 422);

  // Divide como a reserva (decisão de 17/11/2026): a diferença é vaga, então vai a parte do
  // estacionamento e a comissão da Movepark. Antes ia 100% para a Movepark.
  const { data: settingRows } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", ["pagarme_movepark_recipient_id", "pagarme_split_enabled"]);
  const settingMap = Object.fromEntries(
    ((settingRows ?? []) as { key: string; value: string | null }[]).map((s) => [s.key, s.value]),
  );
  const moveparkRecipientId = (settingMap.pagarme_movepark_recipient_id ?? "").trim();
  const splitEnabled = effectiveSplitEnabled(settingMap.pagarme_split_enabled, company?.gateway_split_enabled);
  const { data: recipient } = await admin
    .from("payout_recipient")
    .select("external_recipient_id, status, gateway_missing_at")
    .eq("company_id", companyId)
    .eq("provider", "pagarme")
    .is("deleted_at", null)
    .maybeSingle();
  if (splitEnabled && (!recipient?.external_recipient_id || recipient.gateway_missing_at || recipient.status !== "active")) {
    return jsonResponse({ error: "O estacionamento ainda não tem recebedor ativo no gateway." }, 409);
  }
  let split;
  try {
    const base = chargeSplitBase(quote);
    split = buildSplit({
      chargedCents: base.chargedCents,
      baseCents: base.baseCents,
      platformFundedCents: base.platformFundedCents,
      takeRateBps: commission.takeRateBps,
      moveparkRecipientId,
      partnerRecipientId: recipient?.external_recipient_id ?? null,
      requireRecipients: splitEnabled,
      method: "pix",
      feePayer: commission.feePayer,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Falha ao montar o split" }, 422);
  }

  // Troca nova vence a anterior, depois segura a vaga nova.
  await cancelPendingDateChanges(admin, gateway, booking.id);
  const { error: hErr } = await admin.rpc("hold_paid_date_change", {
    p_booking_id: booking.id,
    p_check_in: input.checkInAt,
    p_check_out: input.checkOutAt,
  });
  if (hErr) return jsonResponse({ error: hErr.message }, 409);

  const paymentId = crypto.randomUUID();
  const externalCode = `${booking.code}-DT-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const result = await gateway.createPixCharge({
    externalCode,
    amountCents: deltaCents,
    customer: {
      name: payerName,
      email,
      document: booking.customer_tax_id ?? null,
      type: customerTypeFor(booking.customer_tax_id),
      phone,
    },
    items: [{ amount: deltaCents, description: `Alteração de datas · ${booking.code}`, quantity: 1 }],
    // Com a custódia ligada o gateway não recebe split: o valor cai inteiro na Movepark.
    // O snapshot gravado em `payment.split` segue sendo o razão do que devemos ao parceiro.
    split: splitEnabled ? split : undefined,
    // Validade do QR = a mesma config de hold da reserva (E0.3.1-a). É o `payment.expires_at` que
    // o cron `expire-date-change-holds` usa para soltar a vaga nova.
    expiresInSeconds: pixExpiresInSeconds((await admin.rpc("get_booking_hold_minutes")).data),
    metadata: { booking_id: booking.id, booking_code: booking.code, kind: "date_change" },
  });
  if (!result.orderId || (result.httpStatus ?? 500) >= 400) {
    console.error("[change-booking-dates-paid] order falhou:", result.httpStatus, JSON.stringify(result.raw));
    await logGatewayEvent(admin, {
      paymentId: null,
      bookingId: booking.id,
      kind: "charge_failed",
      httpStatus: result.httpStatus,
      request: { method: "pix", amount_cents: deltaCents, kind: "date_change" },
      response: result.raw,
      note: "PIX da diferença de datas recusado pelo gateway",
    });
    // Solta a vaga que acabamos de segurar: sem cobrança, ninguém paga por ela.
    const { data: tmp } = await admin.from("payment").insert({
      id: paymentId, booking_id: booking.id, provider: "pagarme", method: "pix", kind: "date_change",
      date_change_check_in_at: input.checkInAt, date_change_check_out_at: input.checkOutAt,
      amount: deltaCents / 100, status: "pending",
    }).select("id").maybeSingle();
    if (tmp) await admin.rpc("expire_paid_date_change_hold", { p_payment_id: paymentId });
    return jsonResponse({ error: "Falha ao gerar a cobrança da diferença." }, 502);
  }

  const { error: payErr } = await admin.from("payment").insert({
    id: paymentId,
    booking_id: booking.id,
    provider: "pagarme",
    method: "pix",
    kind: "date_change",
    date_change_check_in_at: input.checkInAt,
    date_change_check_out_at: input.checkOutAt,
    date_change_quote: quote,
    provider_payment_id: result.orderId,
    provider_charge_id: result.chargeId,
    amount: deltaCents / 100,
    status: chargeStatusToPaymentStatus(result.status),
    pix_qr_code: result.qrCode,
    pix_qr_code_url: result.qrCodeUrl,
    expires_at: result.expiresAt,
    split,
    split_sent_to_gateway: splitEnabled,
  });
  if (payErr) return jsonResponse({ error: payErr.message }, 500);
  await logGatewayEvent(admin, {
    paymentId,
    bookingId: booking.id,
    kind: "charge_created",
    httpStatus: result.httpStatus,
    request: {
      method: "pix",
      kind: "date_change",
      amount_cents: deltaCents,
      split: splitEnabled ? split : null,
      commission: { channel: commission.channel, take_rate_bps: commission.takeRateBps, fee_payer: commission.feePayer },
      price_source: quote.price_source,
      actor: actorRole,
    },
    response: result.raw,
  });

  return jsonResponse(
    {
      ...view,
      mode: "charge",
      payment_id: paymentId,
      status: result.status,
      qr_code: result.qrCode,
      qr_code_url: result.qrCodeUrl,
      expires_at: result.expiresAt,
    },
    201,
  );
});
