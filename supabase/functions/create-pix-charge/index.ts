// Edge Function: /create-pix-charge
// Cria uma cobrança PIX com SPLIT (E0.1.2, ADR-004) para uma reserva, via camada _shared/payments.
// Comissão (take_rate) → recebedor master da Movepark; restante → recebedor do parceiro (que
// absorve as taxas). Grava `payment` (provider=pagarme) e devolve o QR (copia-e-cola + imagem).
// A confirmação chega pela Edge `pagarme-webhook`.
//
// POST /functions/v1/create-pix-charge
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXXXX" }
//
// Resposta (201): { payment_id, status, qr_code, qr_code_url, expires_at }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSplit,
  chargeStatusToPaymentStatus,
  getGateway,
  GatewayConfigError,
} from "../_shared/payments/index.ts";
import { buildPixItems, parseBrPhone, reaisToCents } from "./logic.ts";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  let input: { booking_code?: string };
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!input.booking_code) return jsonResponse({ error: "booking_code é obrigatório" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1. Reserva (pertence ao usuário, pendente, não expirada)
  const { data: booking } = await admin
    .from("booking")
    .select("id, code, status, total_amount, fare_price_cents, expires_at, profile_id, location_id")
    .eq("code", input.booking_code)
    .maybeSingle();
  if (!booking) return jsonResponse({ error: "Reserva não encontrada" }, 404);
  if (booking.profile_id !== userData.user.id) {
    return jsonResponse({ error: "Reserva não pertence a você" }, 403);
  }
  if (booking.status !== "pending") {
    return jsonResponse({ error: `Reserva já está ${booking.status}` }, 400);
  }
  if (booking.expires_at && new Date(booking.expires_at) < new Date()) {
    return jsonResponse({ error: "Reserva expirada" }, 400);
  }

  // Gate de conformidade (RFN005/LGPD): sem aceite explícito dos Termos, não cobra (server-authoritative).
  const { count: termsCount } = await admin
    .from("terms_acceptance")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id);
  if (!termsCount) {
    return jsonResponse({ error: "É necessário aceitar os Termos de Uso antes de pagar." }, 422);
  }

  // 2. Empresa do lote + take_rate + recebedor do parceiro
  const { data: location } = await admin
    .from("location")
    .select("company_id")
    .eq("id", booking.location_id)
    .maybeSingle();
  if (!location) return jsonResponse({ error: "Unidade não encontrada" }, 404);

  const { data: company } = await admin
    .from("company")
    .select("take_rate_bps")
    .eq("id", location.company_id)
    .maybeSingle();

  const { data: recipient } = await admin
    .from("payout_recipient")
    .select("external_recipient_id, status")
    .eq("company_id", location.company_id)
    .eq("provider", "pagarme")
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipient?.external_recipient_id) {
    return jsonResponse(
      { error: "O estacionamento ainda não tem recebedor ativo no gateway." },
      409,
    );
  }

  // 3. Recebedor master da Movepark (configurável no Manager)
  const { data: setting } = await admin
    .from("app_setting")
    .select("value")
    .eq("key", "pagarme_movepark_recipient_id")
    .maybeSingle();
  const moveparkRecipientId = (setting?.value ?? "").trim();

  // 4. Split. A Tarifa (E2.8) é receita de serviço Movepark, FORA do split da vaga: o base do
  // parceiro exclui a tarifa, e o excedente (= tarifa) cai na perna da Movepark via buildSplit.
  const totalCents = reaisToCents(Number(booking.total_amount));
  const fareCents = booking.fare_price_cents ?? 0;
  const partnerBaseCents = totalCents - fareCents;
  let split;
  try {
    split = buildSplit({
      chargedCents: totalCents, // PIX não tem juros; o excedente sobre o base é só a tarifa
      baseCents: partnerBaseCents,
      takeRateBps: company?.take_rate_bps ?? 0,
      moveparkRecipientId,
      partnerRecipientId: recipient.external_recipient_id,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Falha ao montar o split" }, 422);
  }

  // 5. Cliente (perfil + e-mail do auth)
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, tax_id, phone")
    .eq("id", booking.profile_id)
    .maybeSingle();
  const { data: authUser } = await admin.auth.admin.getUserById(booking.profile_id);
  const email = authUser?.user?.email ?? null;
  if (!email) return jsonResponse({ error: "Cliente sem e-mail para a cobrança." }, 422);

  // PIX no Pagar.me exige o documento do cliente — sem ele o gateway recusa a cobrança ("failed").
  if (!isValidChargeDocument(profile?.tax_id)) {
    return jsonResponse(
      { error: "Cliente sem CPF/CNPJ válido para a cobrança PIX. Informe o documento no checkout." },
      422,
    );
  }

  // PIX no Pagar.me exige telefone do cliente.
  const phone = parseBrPhone(profile?.phone);
  if (!phone) {
    return jsonResponse(
      { error: "Cliente sem telefone (com DDD) para a cobrança PIX. Atualize o cadastro." },
      422,
    );
  }

  // 6. Cobrança no gateway. A validade do QR = a janela de hold (config única, E0.3.1-a): o QR e o
  // hold da reserva derivam do MESMO valor — nunca dois relógios soltos.
  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }

  const { data: holdMin } = await admin.rpc("get_booking_hold_minutes");
  const holdMinutes = Number(holdMin ?? 30);

  const result = await gateway.createPixCharge({
    externalCode: booking.code,
    amountCents: totalCents,
    customer: {
      name: profile?.full_name ?? "Cliente Movepark",
      email,
      document: profile?.tax_id ?? null,
      type: customerTypeFor(profile?.tax_id),
      phone,
    },
    items: buildPixItems(booking.code, totalCents),
    split,
    expiresInSeconds: holdMinutes * 60,
    metadata: { booking_id: booking.id, booking_code: booking.code },
  });

  if (!result.orderId || (result.httpStatus ?? 500) >= 400) {
    console.error("Pagar.me order falhou:", result.httpStatus, JSON.stringify(result.raw));
    return jsonResponse({ error: "Falha ao gerar a cobrança PIX." }, 502);
  }

  // 7. Grava o payment
  const paymentId = crypto.randomUUID();
  const { error: payErr } = await admin.from("payment").insert({
    id: paymentId,
    booking_id: booking.id,
    provider: "pagarme",
    method: "pix",
    provider_payment_id: result.orderId,
    provider_charge_id: result.chargeId,
    amount: booking.total_amount,
    status: chargeStatusToPaymentStatus(result.status),
    pix_qr_code: result.qrCode,
    pix_qr_code_url: result.qrCodeUrl,
    expires_at: result.expiresAt,
    split,
  });
  if (payErr) return jsonResponse({ error: payErr.message }, 500);

  // 8. Renova o hold: o "relógio de pagar" começa quando o cliente gera o PIX (E0.3.1-a). O hold
  // passa a cobrir a validade do QR (mesmo valor). Countdown e o polling do checkout herdam sozinhos.
  const newExpiry = new Date(Date.now() + holdMinutes * 60_000).toISOString();
  await admin
    .from("booking")
    .update({ expires_at: newExpiry })
    .eq("id", booking.id)
    .eq("status", "pending");

  return jsonResponse(
    {
      payment_id: paymentId,
      status: result.status,
      qr_code: result.qrCode,
      qr_code_url: result.qrCodeUrl,
      expires_at: result.expiresAt,
    },
    201,
  );
});
