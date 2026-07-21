// Edge Function: /reconcile-refunds
// Rede de segurança do estorno (A3): quando um estorno foi iniciado (payment `paid` + `refunded_at`
// setado = refund_pending, tipicamente PIX assíncrono) mas o webhook `charge.refunded` NUNCA chegou,
// o payment fica preso em "paid". Este poll reavalia no gateway e reflete `refunded` quando confirmado.
// Complementa o webhook (push) com um poll — mesmo padrão do refresh-recipients.
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-reconcile-refunds-key.
//
// POST /functions/v1/reconcile-refunds   (header: x-reconcile-refunds-key: <RECONCILE_REFUNDS_KEY>)
// → { ok, checked, updated }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargeStatusToPaymentStatus, getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { BATCH_LIMIT, decideReconcileAction, refundCutoffIso } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // A chave interna vem do Vault (mesma que o cron envia) — sem env var, sem sincronizar segredo.
  const { data: expected } = await admin.rpc("reconcile_refunds_expected_key");
  if (!expected || req.headers.get("x-reconcile-refunds-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  // "Estorno pendente": pago, com refunded_at setado (estorno iniciado) antes do corte da janela.
  const { data: payments, error } = await admin
    .from("payment")
    .select("id, provider_payment_id, booking_id")
    .eq("provider", "pagarme")
    .eq("status", "paid")
    .not("refunded_at", "is", null)
    .lt("refunded_at", refundCutoffIso(Date.now()))
    .limit(BATCH_LIMIT);
  if (error) return json({ error: error.message }, 500);

  let updated = 0;
  for (const p of payments ?? []) {
    if (!p.provider_payment_id) continue;
    try {
      const charge = await gateway.getCharge(p.provider_payment_id);

      // Precisa do status da reserva para decidir se o estorno também a cancela.
      const { data: bk } = await admin
        .from("booking")
        .select("status")
        .eq("id", p.booking_id)
        .maybeSingle();

      const action = decideReconcileAction(charge.status, bk?.status);
      if (!action.markRefunded) continue;

      await admin
        .from("payment")
        .update({ status: chargeStatusToPaymentStatus("refunded") })
        .eq("id", p.id);
      updated += 1;

      // Mesma regra do webhook: estorno total cancela a reserva se ainda confirmada/pendente (libera
      // a vaga). Sem isto, um estorno cujo webhook não chegou reconciliava o payment mas deixava a
      // reserva confirmada, o mesmo bug pela porta dos fundos.
      if (action.cancelBooking) {
        const { error: cancelErr } = await admin.rpc("cancel_booking_with_release", {
          p_booking_id: p.booking_id,
          p_reason: "estorno total reconciliado (webhook não chegou)",
        });
        if (cancelErr) {
          console.error("[reconcile-refunds] cancelamento pós-estorno falhou:", cancelErr.message);
        }
      }
    } catch (e) {
      console.error("[reconcile-refunds] falha em", p.provider_payment_id, e);
    }
  }

  return json({ ok: true, checked: payments?.length ?? 0, updated });
});
