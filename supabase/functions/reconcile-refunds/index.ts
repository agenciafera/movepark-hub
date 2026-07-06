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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Só reavalia estornos iniciados há mais de N min (dá tempo do fluxo assíncrono do PIX + webhook).
const CUTOFF_MINUTES = 15;

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

  // "Estorno pendente": pago, com refunded_at setado (estorno iniciado) há mais de CUTOFF_MINUTES.
  const cutoff = new Date(Date.now() - CUTOFF_MINUTES * 60_000).toISOString();
  const { data: payments, error } = await admin
    .from("payment")
    .select("id, provider_payment_id")
    .eq("provider", "pagarme")
    .eq("status", "paid")
    .not("refunded_at", "is", null)
    .lt("refunded_at", cutoff)
    .limit(100);
  if (error) return json({ error: error.message }, 500);

  let updated = 0;
  for (const p of payments ?? []) {
    if (!p.provider_payment_id) continue;
    try {
      const charge = await gateway.getCharge(p.provider_payment_id);
      if (charge.status === "refunded") {
        await admin
          .from("payment")
          .update({ status: chargeStatusToPaymentStatus("refunded") })
          .eq("id", p.id);
        updated += 1;
      }
    } catch (e) {
      console.error("[reconcile-refunds] falha em", p.provider_payment_id, e);
    }
  }

  return json({ ok: true, checked: payments?.length ?? 0, updated });
});
