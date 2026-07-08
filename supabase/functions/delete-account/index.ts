// Edge Function: /delete-account
// Exclusão de conta pelo PRÓPRIO usuário + anonimização (E0.9, LGPD art. 18).
//
// Decisão de negócio: anonimizar mantendo a venda. O usuário some (vira anônimo), mas as
// reservas/pagamentos ficam (obrigação fiscal). Só consumidor: se for membro de empresa, aborta.
// Ver docs/specs/customer/account-deletion.md.
//
// Orquestração (precisa de service_role, por isso mora aqui e não no client):
//   1. valida o JWT (auth.uid());
//   2. guarda "só consumidor" (sem profile_company);
//   3. cancela + estorna as reservas ATIVAS (reusa refundDecision + gateway, como cancel-booking);
//   4. anonimiza o banco via RPC anonymize_own_account() (com o JWT do usuário → auth.uid());
//   5. apaga os PDFs de voucher (Storage privado);
//   6. faz scrub + ban permanente do auth.users (login fica impossível).
//
// POST /functions/v1/delete-account
// Authorization: Bearer <JWT do próprio usuário>
// {}  → { ok: true, cancelled: number, refunded: number }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { refundDecision } from "../cancel-booking/logic.ts";
import { anonymizedEmail, PERMANENT_BAN_DURATION, voucherObjectPath, isActiveBooking } from "./logic.ts";

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

  // Client com o JWT do usuário → auth.uid() é ele mesmo (a RPC usa isso).
  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
  const uid = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // (2) Guarda "só consumidor" — antes de qualquer efeito colateral. A RPC também guarda.
  const { data: memberships, error: memErr } = await admin
    .from("profile_company")
    .select("company_id")
    .eq("profile_id", uid)
    .limit(1);
  if (memErr) return jsonResponse({ error: memErr.message }, 500);
  if (memberships && memberships.length > 0) {
    return jsonResponse(
      { error: "Conta vinculada a uma empresa. Saia ou transfira a titularidade antes de excluir." },
      409,
    );
  }

  // (3) Cancela + estorna as reservas ativas. Reusa a decisão de estorno do cancel-booking.
  const { data: activeCandidates, error: bErr } = await admin
    .from("booking")
    .select("id, status, check_in_at, check_out_at, fare_cancel_until")
    .eq("profile_id", uid)
    .is("deleted_at", null)
    .in("status", ["pending", "confirmed"]);
  if (bErr) return jsonResponse({ error: bErr.message }, 500);

  const now = new Date();
  const active = (activeCandidates ?? []).filter((b) => isActiveBooking(b.status, b.check_out_at, now));

  let cancelled = 0;
  let refunded = 0;
  for (const b of active) {
    const { data: payment } = await admin
      .from("payment")
      .select("id, provider, provider_payment_id, provider_charge_id, amount, status, refunded_at")
      .eq("booking_id", b.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const decision = refundDecision({
      actor: "customer",
      bookingStatus: b.status,
      paymentStatus: payment?.status ?? null,
      alreadyRefunded: !!payment?.refunded_at,
      checkInAt: b.check_in_at,
      fareCancelUntil: b.fare_cancel_until,
      now,
    });

    if (decision.action === "cancel_with_refund" && payment) {
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
      const refund = await gateway.refundCharge({ chargeId });
      if (refund.httpStatus != null && refund.httpStatus >= 400) {
        // NUNCA cancela sem estornar: aborta sem tocar no booking (idempotente ao repetir).
        console.error("[delete-account] estorno falhou:", refund.httpStatus, JSON.stringify(refund.raw));
        return jsonResponse({ error: "Falha ao estornar um pagamento. Tente novamente." }, 502);
      }
      refunded += 1;
      await admin
        .from("payment")
        .update({
          status: refund.status !== "refunded" ? "paid" : "refunded",
          refunded_at: new Date().toISOString(),
          refunded_amount: payment.amount,
          refund_reason: "exclusão de conta",
          provider_charge_id: chargeId,
        })
        .eq("id", payment.id);
    }

    const { error: rpcErr } = await admin.rpc("cancel_booking_with_release", {
      p_booking_id: b.id,
      p_reason: "exclusão de conta",
    });
    if (rpcErr) return jsonResponse({ error: rpcErr.message }, 500);
    cancelled += 1;
  }

  // Coleta os ids das reservas ANTES do scrub (voucher_url será nulificado, mas o path é por id).
  const { data: allBookings } = await admin
    .from("booking")
    .select("id")
    .eq("profile_id", uid);

  // (4) Anonimização atômica no banco — com o JWT do usuário (auth.uid()).
  const { error: anonErr } = await userClient.rpc("anonymize_own_account");
  if (anonErr) {
    // Ex.: guarda de empresa disparada entre a checagem e agora → devolve claro.
    return jsonResponse({ error: anonErr.message }, 400);
  }

  // (5) Apaga os PDFs de voucher (Storage privado; só service_role acessa).
  const voucherPaths = (allBookings ?? []).map((b) => voucherObjectPath(b.id));
  if (voucherPaths.length > 0) {
    const { error: rmErr } = await admin.storage.from("vouchers").remove(voucherPaths);
    if (rmErr) console.error("[delete-account] falha ao apagar vouchers (ignorado):", rmErr.message);
  }

  // (6) Scrub + ban permanente do auth.users → login impossível e e-mail/metadata anonimizados.
  const { error: authErr } = await admin.auth.admin.updateUserById(uid, {
    email: anonymizedEmail(uid),
    user_metadata: {},
    // @ts-expect-error - ban_duration é aceito pela Admin API mas não está no tipo do SDK
    ban_duration: PERMANENT_BAN_DURATION,
  });
  if (authErr) {
    // Banco já anonimizado; o login segue ativo. Retorna erro pra retry (RPC é idempotente).
    console.error("[delete-account] scrub/ban do auth.users falhou:", authErr.message);
    return jsonResponse({ error: "Falha ao encerrar o login. Tente novamente." }, 502);
  }

  return jsonResponse({ ok: true, cancelled, refunded });
});
