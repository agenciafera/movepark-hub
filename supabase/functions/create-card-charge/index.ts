// Edge Function: /create-card-charge
// Cria uma cobrança com CARTÃO de crédito (parcelado) + SPLIT (E0.1.3, ADR-004) para uma reserva.
// Server-authoritative: a parcela escolhida é revalidada contra a política (app_setting,
// card_installment_policy) e o valor financiado é RECALCULADO aqui — o cliente nunca informa o valor.
// Tokenização é client-side (nunca trafega o PAN). Confirmação chega pela Edge `pagarme-webhook`.
//
// POST /functions/v1/create-card-charge
// Authorization: Bearer <JWT>
// { booking_code, card_token? | payment_method_id?, installments, save_card?, holder_name?, brand?, last4?, exp_month?, exp_year? }
//
// Resposta (201): { payment_id, status, installments, charged_amount, interest_amount, saved_card }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSplit,
  chargeStatusToPaymentStatus,
  getGateway,
  GatewayConfigError,
} from "../_shared/payments/index.ts";
import { computeInstallmentPlan, parseInstallmentPolicy } from "../_shared/payments/installments.ts";
import { buildCardItems, extractCardId, parseCardInput, reaisToCents } from "./logic.ts";
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseCardInput(body);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1. Reserva (pertence ao usuário, pendente, não expirada)
  const { data: booking } = await admin
    .from("booking")
    .select(
      "id, code, status, total_amount, fare_price_cents, expires_at, profile_id, location_id, " +
        "customer_name, customer_first_name, customer_last_name, customer_email, customer_tax_id",
    )
    .eq("code", input.bookingCode)
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

  // 1a. Gate de conformidade (RFN005/LGPD): sem aceite explícito dos Termos, não cobra.
  const { count: termsCount } = await admin
    .from("terms_acceptance")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id);
  if (!termsCount) {
    return jsonResponse({ error: "É necessário aceitar os Termos de Uso antes de pagar." }, 422);
  }

  // 1b. Idempotência: não cobrar de novo se já há pagamento aprovado/autorizado.
  const { data: paid } = await admin
    .from("payment")
    .select("id")
    .eq("booking_id", booking.id)
    .in("status", ["paid", "authorized"])
    .limit(1)
    .maybeSingle();
  if (paid) return jsonResponse({ error: "Esta reserva já foi paga." }, 409);

  // 2. Empresa + take_rate + recebedor do parceiro
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
    .select("external_recipient_id")
    .eq("company_id", location.company_id)
    .eq("provider", "pagarme")
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipient?.external_recipient_id) {
    return jsonResponse({ error: "O estacionamento ainda não tem recebedor ativo no gateway." }, 409);
  }

  // 3. Recebedor master da Movepark + política de parcelamento (Manager)
  const { data: settings } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", ["pagarme_movepark_recipient_id", "card_installment_policy"]);
  const settingMap = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  const moveparkRecipientId = (settingMap.pagarme_movepark_recipient_id ?? "").trim();
  const policy = parseInstallmentPolicy(settingMap.card_installment_policy);
  if (!policy.enabled) return jsonResponse({ error: "Pagamento com cartão indisponível." }, 422);

  // 4. Parcela escolhida revalidada contra a política (server-authoritative). O cliente parcela o
  // TOTAL (vaga + tarifa); os juros incidem sobre esse total.
  const baseCents = reaisToCents(Number(booking.total_amount));
  const plan = computeInstallmentPlan(baseCents, policy);
  const chosen = plan.find((o) => o.installments === input.installments);
  if (!chosen) return jsonResponse({ error: "Parcelamento inválido para esta reserva." }, 422);
  const chargedCents = chosen.totalCents;
  const interestCents = chosen.interestCents;

  // 5. Split. Parceiro recebe sobre o preço da VAGA (base − tarifa); a Tarifa (E2.8, serviço
  // Movepark) e o excedente de juros vão pra perna da Movepark.
  const fareCents = booking.fare_price_cents ?? 0;
  const partnerBaseCents = baseCents - fareCents;
  let split;
  try {
    split = buildSplit({
      chargedCents,
      baseCents: partnerBaseCents,
      takeRateBps: company?.take_rate_bps ?? 0,
      moveparkRecipientId,
      partnerRecipientId: recipient.external_recipient_id,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Falha ao montar o split" }, 422);
  }

  // 6. Pagador: do snapshot do booking (o titular preencheu no checkout). Não lê profiles; o e-mail
  //    cai no auth só como reforço (login por e-mail tem o e-mail travado na conta).
  const payerName =
    [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim() ||
    booking.customer_name ||
    "Cliente Movepark";
  const { data: authUser } = await admin.auth.admin.getUserById(booking.profile_id);
  const email = booking.customer_email ?? authUser?.user?.email ?? null;
  if (!email) return jsonResponse({ error: "Cliente sem e-mail para a cobrança." }, 422);
  if (!isValidChargeDocument(booking.customer_tax_id)) {
    return jsonResponse(
      { error: "Cliente sem CPF/CNPJ válido para a cobrança. Informe o documento no checkout." },
      422,
    );
  }

  // 7. Resolve o cartão: salvo (card_id) ou novo (token).
  let cardRef: { cardToken?: string; cardId?: string };
  if (input.paymentMethodId) {
    const { data: pm } = await admin
      .from("payment_method")
      .select("provider_token")
      .eq("id", input.paymentMethodId)
      .eq("profile_id", booking.profile_id)
      .eq("provider", "pagarme")
      .is("deleted_at", null)
      .maybeSingle();
    if (!pm?.provider_token) return jsonResponse({ error: "Cartão salvo não encontrado." }, 404);
    cardRef = { cardId: pm.provider_token };
  } else {
    cardRef = { cardToken: input.cardToken! };
  }

  // 8. Cobrança no gateway
  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }

  const result = await gateway.createCardCharge({
    externalCode: booking.code,
    amountCents: chargedCents,
    customer: {
      name: payerName,
      email,
      document: booking.customer_tax_id ?? null,
      type: customerTypeFor(booking.customer_tax_id),
    },
    items: buildCardItems(booking.code, baseCents, interestCents),
    split,
    card: cardRef,
    installments: input.installments,
    metadata: { booking_id: booking.id, booking_code: booking.code, base_cents: String(baseCents) },
  });

  // Recusa do emissor → registra failed e responde 402 (sem confirmar a reserva).
  if (result.status === "failed") {
    await admin.from("payment").insert({
      id: crypto.randomUUID(),
      booking_id: booking.id,
      provider: "pagarme",
      method: "card",
      provider_payment_id: result.orderId,
      provider_charge_id: result.chargeId,
      amount: chargedCents / 100,
      status: "failed",
      installments: input.installments,
      split,
    });
    return jsonResponse({ error: "Cartão recusado. Tente outro cartão." }, 402);
  }
  if (!result.orderId || (result.httpStatus ?? 500) >= 400) {
    console.error("Pagar.me card order falhou:", result.httpStatus, JSON.stringify(result.raw));
    return jsonResponse({ error: "Falha ao processar o cartão." }, 502);
  }

  // 9. Grava o payment (paid imediato ou pending p/ análise → webhook confirma)
  const paymentId = crypto.randomUUID();
  const { error: payErr } = await admin.from("payment").insert({
    id: paymentId,
    booking_id: booking.id,
    provider: "pagarme",
    method: "card",
    provider_payment_id: result.orderId,
    provider_charge_id: result.chargeId,
    amount: chargedCents / 100,
    status: chargeStatusToPaymentStatus(result.status),
    installments: input.installments,
    split,
  });
  if (payErr) return jsonResponse({ error: payErr.message }, 500);

  // 9b. Renova o hold enquanto pending (E0.3.1-a). Cartão aprovado inline vira confirmed (a RPC zera
  // o expires_at); cartão em análise (authorized/pending) mantém o hold vivo até o webhook.
  const { data: holdMin } = await admin.rpc("get_booking_hold_minutes");
  const holdMinutes = Number(holdMin ?? 30);
  await admin
    .from("booking")
    .update({ expires_at: new Date(Date.now() + holdMinutes * 60_000).toISOString() })
    .eq("id", booking.id)
    .eq("status", "pending");

  // 9c. Aprovado na hora → confirma inline (não espera o webhook), melhorando o feedback no checkout.
  // O webhook `charge.paid`/`order.paid` chega depois, vê 'confirmed' → noop, e segue como gerador
  // único do voucher. Cartão em análise NÃO confirma aqui — o webhook confirma quando virar 'paid'.
  if (result.status === "paid") {
    await admin.rpc("confirm_or_refund_booking", {
      p_booking_id: booking.id,
      p_payment_id: paymentId,
    });
  }

  // 10. Salvar o cartão (opt-in) — só token+brand+last4 (nunca PAN).
  let savedCard = false;
  if (input.saveCard && input.cardToken) {
    const cardId = extractCardId(result.raw);
    if (cardId) {
      const { error: pmErr } = await admin.from("payment_method").insert({
        profile_id: booking.profile_id,
        provider: "pagarme",
        provider_token: cardId,
        brand: input.card.brand ?? "card",
        last4: input.card.last4 ?? "0000",
        holder_name: input.card.holderName,
        expiry_month: input.card.expMonth,
        expiry_year: input.card.expYear,
      });
      savedCard = !pmErr;
    }
  }

  return jsonResponse(
    {
      payment_id: paymentId,
      status: result.status,
      installments: input.installments,
      charged_amount: chargedCents / 100,
      interest_amount: interestCents / 100,
      saved_card: savedCard,
    },
    201,
  );
});
