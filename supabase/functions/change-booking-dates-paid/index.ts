// Edge Function: /change-booking-dates-paid
// Altera as datas de uma reserva PAGA (confirmed), cobrando/estornando a diferença (E2.8-h, Fase B).
// Gateado pelo benefício `date_change` (Flex+); staff faz override. Re-preço a preço atual.
//   delta = 0  → aplica na hora (apply_paid_date_change, acquire).
//   delta < 0  → aplica na hora + ESTORNO PARCIAL da diferença no gateway.
//   delta > 0  → segura a vaga nova (hold) + cobra o delta por PIX; aplica no webhook (kind=date_change).
// Reserva PENDENTE usa /change-booking-dates (re-precifica sem cobrar). Dono ou staff.
//
// POST /functions/v1/change-booking-dates-paid
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXX", "check_in_at": "...ISO...", "check_out_at": "...ISO..." }
// → 200 { mode: "applied", delta, refunded? } | 201 { mode: "charge", payment_id, qr_code, ... }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chargeStatusToPaymentStatus,
  getGateway,
  GatewayConfigError,
} from "../_shared/payments/index.ts";
import { customerTypeFor, isValidChargeDocument } from "../_shared/payments/documents.ts";
import { parseBrPhone, parseChangeDatesPaidInput } from "./logic.ts";

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
const PIX_EXPIRES_IN_SECONDS = 3600;

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

  const { data: booking, error: bErr } = await admin
    .from("booking")
    .select(
      "id, code, status, check_in_at, fare_benefits, profile_id, " +
        "customer_name, customer_first_name, customer_last_name, customer_email, customer_phone, customer_tax_id, " +
        "location:location!inner(company_id)",
    )
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  if (!booking) return jsonResponse({ error: "Reserva não encontrada." }, 404);

  // Autorização: dono ou staff.
  // deno-lint-ignore no-explicit-any
  const companyId = (booking as any).location?.company_id as string | undefined;
  let isStaff = false;
  if (booking.profile_id !== userId) {
    const { data: caller } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (caller?.role === "hub_admin") {
      isStaff = true;
    } else if (caller?.role === "company_operator" && companyId) {
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

  if (booking.status !== "confirmed") {
    return jsonResponse(
      { error: "Este fluxo é para reserva paga. Reserva pendente altera datas em /change-booking-dates." },
      400,
    );
  }
  if (new Date(booking.check_in_at) <= new Date()) {
    return jsonResponse({ error: "A reserva já começou." }, 400);
  }
  // deno-lint-ignore no-explicit-any
  const benefits = (booking.fare_benefits ?? {}) as Record<string, any>;
  if (!isStaff && benefits.date_change !== true) {
    return jsonResponse(
      { error: "Sua Tarifa não permite alterar datas. Faça upgrade para Flex ou Superflex." },
      403,
    );
  }

  // Cotação (read-only) das novas datas.
  const { data: quote, error: qErr } = await admin.rpc("reprice_booking_dates", {
    p_booking_id: booking.id,
    p_check_in: input.checkInAt,
    p_check_out: input.checkOutAt,
  });
  if (qErr) return jsonResponse({ error: qErr.message }, 400);
  const q = quote as { available: boolean; reason: string | null; delta_cents: number };
  if (!q.available) return jsonResponse({ error: q.reason ?? "Datas indisponíveis." }, 409);
  const deltaCents = q.delta_cents;

  // ── delta <= 0: aplica na hora (segura a vaga nova aqui) ──────────────────────
  if (deltaCents <= 0) {
    const { data: applied, error: aErr } = await admin.rpc("apply_paid_date_change", {
      p_booking_id: booking.id,
      p_check_in: input.checkInAt,
      p_check_out: input.checkOutAt,
      p_actor_id: userId,
      p_acquire: true,
    });
    if (aErr) return jsonResponse({ error: aErr.message }, 409);

    let refunded = false;
    let refundPending = false;
    if (deltaCents < 0) {
      // Estorno PARCIAL da diferença na cobrança original da reserva.
      const { data: payment } = await admin
        .from("payment")
        .select("id, provider, provider_payment_id, provider_charge_id, refunded_amount")
        .eq("booking_id", booking.id)
        .eq("kind", "booking")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (payment) {
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
        if (chargeId) {
          const refund = await gateway.refundCharge({ chargeId, amountCents: -deltaCents });
          if (refund.httpStatus == null || refund.httpStatus < 400) {
            refunded = true;
            refundPending = refund.status !== "refunded";
            await admin
              .from("payment")
              .update({
                refunded_amount: (Number(payment.refunded_amount ?? 0) + -deltaCents / 100),
                refunded_at: new Date().toISOString(),
                provider_charge_id: chargeId,
              })
              .eq("id", payment.id);
            await admin.rpc("log_booking_modification", {
              p_booking_id: booking.id,
              p_type: "refund",
              p_actor_id: userId,
              p_actor_role: isStaff ? "staff" : "customer",
              p_changes: null,
              p_amount_delta_cents: deltaCents, // negativo (estorno)
              p_reason: "estorno parcial (alteração de datas mais barata)",
            });
          } else {
            console.error("[change-booking-dates-paid] estorno parcial falhou:", refund.httpStatus);
          }
        }
      }
    }
    return jsonResponse({
      mode: "applied",
      delta: deltaCents / 100,
      total_amount: (applied as { total_amount?: number })?.total_amount ?? null,
      refunded,
      refund_pending: refundPending,
    });
  }

  // ── delta > 0: segura a vaga nova + cobra o delta por PIX (aplica no webhook) ──
  const { error: hErr } = await admin.rpc("hold_paid_date_change", {
    p_booking_id: booking.id,
    p_check_in: input.checkInAt,
    p_check_out: input.checkOutAt,
  });
  if (hErr) return jsonResponse({ error: hErr.message }, 409);

  const { data: setting } = await admin
    .from("app_setting")
    .select("value")
    .eq("key", "pagarme_movepark_recipient_id")
    .maybeSingle();
  const moveparkRecipientId = (setting?.value ?? "").trim();
  if (!moveparkRecipientId) {
    return jsonResponse({ error: "Recebedor master da Movepark não configurado." }, 503);
  }

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

  // A diferença é serviço Movepark (split 100% recebedor master, fora do split da vaga).
  const split = [
    {
      recipientId: moveparkRecipientId,
      amount: deltaCents,
      type: "flat" as const,
      liable: true,
      chargeProcessingFee: true,
      chargeRemainderFee: true,
    },
  ];

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }

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
    items: [
      { amount: deltaCents, description: `Alteração de datas · ${booking.code}`, quantity: 1 },
    ],
    split,
    expiresInSeconds: PIX_EXPIRES_IN_SECONDS,
    metadata: { booking_id: booking.id, booking_code: booking.code, kind: "date_change" },
  });
  if (!result.orderId || (result.httpStatus ?? 500) >= 400) {
    // A cobrança falhou: libera o hold que acabamos de segurar.
    console.error("[change-booking-dates-paid] order falhou:", result.httpStatus, JSON.stringify(result.raw));
    return jsonResponse({ error: "Falha ao gerar a cobrança da diferença." }, 502);
  }

  const paymentId = crypto.randomUUID();
  const { error: payErr } = await admin.from("payment").insert({
    id: paymentId,
    booking_id: booking.id,
    provider: "pagarme",
    method: "pix",
    kind: "date_change",
    date_change_check_in_at: input.checkInAt,
    date_change_check_out_at: input.checkOutAt,
    provider_payment_id: result.orderId,
    provider_charge_id: result.chargeId,
    amount: deltaCents / 100,
    status: chargeStatusToPaymentStatus(result.status),
    pix_qr_code: result.qrCode,
    pix_qr_code_url: result.qrCodeUrl,
    expires_at: result.expiresAt,
    split,
  });
  if (payErr) return jsonResponse({ error: payErr.message }, 500);

  return jsonResponse(
    {
      mode: "charge",
      payment_id: paymentId,
      status: result.status,
      qr_code: result.qrCode,
      qr_code_url: result.qrCodeUrl,
      expires_at: result.expiresAt,
      delta: deltaCents / 100,
    },
    201,
  );
});
