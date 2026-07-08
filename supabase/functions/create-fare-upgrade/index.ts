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
import { parseBrPhone, parseUpgradeInput, reaisToCents } from "./logic.ts";
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
    .select("id, code, status, check_in_at, fare_tier, fare_price_cents, profile_id")
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (!booking) return jsonResponse({ error: "Reserva não encontrada" }, 404);
  if (booking.profile_id !== userData.user.id) {
    return jsonResponse({ error: "Reserva não pertence a você" }, 403);
  }
  if (!["pending", "confirmed"].includes(booking.status)) {
    return jsonResponse({ error: "Esta reserva não permite upgrade." }, 400);
  }
  if (new Date(booking.check_in_at) <= new Date()) {
    return jsonResponse({ error: "Upgrade só antes da entrada." }, 400);
  }
  if (booking.fare_tier === input.targetTier) {
    return jsonResponse({ error: "A reserva já está nessa Tarifa." }, 400);
  }

  // 2. Tarifa-alvo + delta (sem downgrade).
  const { data: targetFare } = await admin
    .from("fare")
    .select("price_cents, label")
    .eq("tier", input.targetTier)
    .eq("is_active", true)
    .maybeSingle();
  if (!targetFare) return jsonResponse({ error: "Tarifa-alvo indisponível." }, 404);
  const deltaCents = targetFare.price_cents - (booking.fare_price_cents ?? 0);
  if (deltaCents <= 0) return jsonResponse({ error: "Sem upgrade (Tarifa-alvo não é superior)." }, 400);

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

  // 4. Cliente (CPF + telefone exigidos no PIX).
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, tax_id")
    .eq("id", booking.profile_id)
    .maybeSingle();
  const { data: authUser } = await admin.auth.admin.getUserById(booking.profile_id);
  const email = authUser?.user?.email ?? null;
  if (!email) return jsonResponse({ error: "Cliente sem e-mail para a cobrança." }, 422);
  if (!isValidChargeDocument(profile?.tax_id)) {
    return jsonResponse({ error: "Cliente sem CPF/CNPJ válido para o PIX." }, 422);
  }
  // ADR-006: telefone (credencial) vem do auth.users, não do profiles.
  const phone = parseBrPhone(authUser?.user?.phone);
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
      name: profile?.full_name ?? "Cliente Movepark",
      email,
      document: profile?.tax_id ?? null,
      type: customerTypeFor(profile?.tax_id),
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
