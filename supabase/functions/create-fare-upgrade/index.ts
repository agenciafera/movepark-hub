// Edge Function: /create-fare-upgrade
// Upgrade de Tarifa pós-reserva (E2.8-d): cobra o DELTA (preço-alvo − preço atual) como cobrança PIX
// de SERVIÇO MOVEPARK (split 100% pro recebedor master — fora do split da vaga). Quando o PIX é pago,
// o webhook chama apply_fare_upgrade e promove a Tarifa da reserva. Sem downgrade.
//
// POST /functions/v1/create-fare-upgrade
// Authorization: Bearer <JWT do dono>
// { "booking_code": "MP-XXXX", "target_tier": "flex" | "superflex" }
// Resposta (201): { payment_id, status, qr_code, qr_code_url, expires_at, delta }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargeStatusToPaymentStatus, getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import {
  checkBookingUpgradable,
  checkUpgradeDelta,
  parseBrPhone,
  parseUpgradeInput,
  reaisToCents,
} from "./logic.ts";
import { customerTypeFor, isValidChargeDocument } from "../_shared/payments/documents.ts";

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

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseUpgradeInput(body);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1. Reserva (dona, ainda upgradável: antes da entrada, não terminal).
  const { data: booking } = await admin
    .from("booking")
    .select(
      "id, code, status, check_in_at, fare_tier, fare_price_cents, profile_id, " +
        "customer_name, customer_first_name, customer_last_name, customer_email, customer_phone, customer_tax_id",
    )
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  const bookingDenial = checkBookingUpgradable({
    booking,
    userId: userData.user.id,
    targetTier: input.targetTier,
    now: new Date(),
  });
  if (bookingDenial) return jsonResponse({ error: bookingDenial.error }, bookingDenial.status);

  // 2. Tarifa-alvo + delta (sem downgrade).
  const { data: targetFare } = await admin
    .from("fare")
    .select("price_cents, label")
    .eq("tier", input.targetTier)
    .eq("is_active", true)
    .maybeSingle();
  const deltaDenial = checkUpgradeDelta({
    targetPriceCents: targetFare?.price_cents ?? null,
    currentFarePriceCents: booking.fare_price_cents,
  });
  if (deltaDenial) return jsonResponse({ error: deltaDenial.error }, deltaDenial.status);
  const deltaCents = targetFare!.price_cents - (booking.fare_price_cents ?? 0);

  // 3. Recebedor master da Movepark (a receita do upgrade é 100% Movepark).
  const { data: setting } = await admin
    .from("app_setting")
    .select("value")
    .eq("key", "pagarme_movepark_recipient_id")
    .maybeSingle();
  const moveparkRecipientId = (setting?.value ?? "").trim();
  if (!moveparkRecipientId) {
    return jsonResponse({ error: "Recebedor master da Movepark não configurado." }, 503);
  }

  // 4. Pagador: do snapshot do booking (CPF + telefone exigidos no PIX). Não lê profiles/auth.phone;
  //    o e-mail cai no auth só como reforço (login por e-mail tem o e-mail travado na conta).
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

  // 5. Split 100% Movepark (serviço; absorve as taxas).
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

  const externalCode = `${booking.code}-UP-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
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
    items: [{ amount: deltaCents, description: `Upgrade Tarifa ${targetFare.label} · ${booking.code}`, quantity: 1 }],
    split,
    expiresInSeconds: PIX_EXPIRES_IN_SECONDS,
    metadata: { booking_id: booking.id, booking_code: booking.code, kind: "fare_upgrade" },
  });

  if (!result.orderId || (result.httpStatus ?? 500) >= 400) {
    console.error("Pagar.me upgrade order falhou:", result.httpStatus, JSON.stringify(result.raw));
    return jsonResponse({ error: "Falha ao gerar a cobrança do upgrade." }, 502);
  }

  const paymentId = crypto.randomUUID();
  const { error: payErr } = await admin.from("payment").insert({
    id: paymentId,
    booking_id: booking.id,
    provider: "pagarme",
    method: "pix",
    kind: "fare_upgrade",
    fare_target_tier: input.targetTier,
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
