// Edge Function: /refund-booking
// ESTORNO AVULSO (Manager/Operator) — reembolsa o pagamento de uma reserva via gateway SEM mudar
// o status da reserva. Ação de STAFF, separada do cancelamento (ADR-004). Estorno TOTAL.
//
// Autorização: staff — hub_admin OU company_operator da empresa da reserva (mesmo critério do
// cancel-booking; escopo bookings:cancel). NÃO é ação do cliente (o cliente usa cancel-booking).
//
// POST /functions/v1/refund-booking
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXX", "reason"?: "..." }
// → { refunded: boolean, refund_pending: boolean, already?: boolean }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { parseRefundInput, refundDecision } from "./logic.ts";

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
  const { input, error: inputErr } = parseRefundInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Reserva + empresa (via location).
  const { data: booking, error: bErr } = await admin
    .from("booking")
    .select("id, code, profile_id, location:location!inner(company_id)")
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  if (!booking) return jsonResponse({ error: "Reserva não encontrada." }, 404);

  // deno-lint-ignore no-explicit-any
  const companyId = (booking as any).location?.company_id as string | undefined;

  // Autorização: apenas STAFF (hub_admin ou operador da empresa da reserva).
  let isStaff = false;
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (caller?.role === "hub_admin") {
    isStaff = true;
  } else if (caller?.role === "company_operator" && companyId) {
    const { data: membership } = await admin
      .from("profile_company")
      .select("company_id")
      .eq("profile_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (membership) isStaff = true;
  }
  if (!isStaff) return jsonResponse({ error: "Sem permissão para estornar esta reserva." }, 403);

  // Último payment da reserva.
  const { data: payment } = await admin
    .from("payment")
    .select("id, provider, provider_payment_id, provider_charge_id, amount, status, refunded_at")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const decision = refundDecision({
    paymentStatus: payment?.status ?? null,
    alreadyRefunded: !!payment?.refunded_at,
  });

  if (decision.action === "noop") {
    // Já estornado — idempotente. refund_pending derivado (status ainda "paid" = PIX em processamento).
    return jsonResponse({ refunded: true, refund_pending: payment!.status === "paid", already: true });
  }
  if (decision.action === "reject") {
    const msg =
      decision.reason === "no_payment"
        ? "Não há pagamento para estornar nesta reserva."
        : "O pagamento não está pago (nada a estornar).";
    return jsonResponse({ error: msg }, 422);
  }

  // decision.action === "refund"
  let gateway;
  try {
    gateway = getGateway(payment!.provider ?? "pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }

  // Resolve o charge id: coluna → fallback via getCharge(order id).
  let chargeId = payment!.provider_charge_id as string | null;
  if (!chargeId && payment!.provider_payment_id) {
    const charge = await gateway.getCharge(payment!.provider_payment_id);
    chargeId = charge.chargeId;
  }
  if (!chargeId) {
    return jsonResponse({ error: "Não foi possível localizar a cobrança para estorno." }, 422);
  }

  const refund = await gateway.refundCharge({ chargeId });
  if (refund.httpStatus != null && refund.httpStatus >= 400) {
    console.error("[refund-booking] estorno falhou:", refund.httpStatus, JSON.stringify(refund.raw));
    return jsonResponse({ error: "Falha ao estornar o pagamento. Tente novamente." }, 502);
  }

  // PIX é assíncrono: fica "paid" + refunded_at (refund_pending) até o webhook confirmar; cartão
  // vira "refunded" na hora. NÃO tocamos no status da reserva.
  const refundPending = refund.status !== "refunded";
  await admin
    .from("payment")
    .update({
      status: refundPending ? "paid" : "refunded",
      refunded_at: new Date().toISOString(),
      refunded_amount: payment!.amount,
      refund_reason: input.reason ?? "estorno avulso (staff)",
      provider_charge_id: chargeId,
    })
    .eq("id", payment!.id);

  return jsonResponse({ refunded: true, refund_pending: refundPending });
});
