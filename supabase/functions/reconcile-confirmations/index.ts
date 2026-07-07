// Edge Function: /reconcile-confirmations
// Rede de segurança do fluxo de confirmação (E0.3.1-a, Layer 4): quando o webhook `order.paid`/
// `charge.paid` NUNCA chega, o payment fica `paid` mas a reserva não confirma — ou fica presa em
// `pending` (o cron não a cancela porque o pagamento a protege, ADR-005) ou já expirou pra
// `cancelled` (caso 4c: pago sem vaga). Este poll reconcilia via confirm_or_refund_booking:
// reconfirma se há vaga, senão estorna. Complementa o webhook (push) com um poll — mesmo padrão do
// reconcile-refunds. Chamada interna pelo pg_cron (pg_net), protegida por x-reconcile-confirmations-key.
//
// POST /functions/v1/reconcile-confirmations   (header: x-reconcile-confirmations-key: <KEY>)
// → { ok, checked, confirmed, refunded }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { generateAndStoreVoucher } from "../_shared/voucher/pdf.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Só reconcilia pagamentos confirmados há mais de N min (dá tempo do webhook chegar primeiro).
const CUTOFF_MINUTES = 10;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // A chave interna vem do Vault (mesma que o cron envia) — sem env var, sem sincronizar segredo.
  const { data: expected } = await admin.rpc("reconcile_confirmations_expected_key");
  if (!expected || req.headers.get("x-reconcile-confirmations-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  // Pagamento pago cuja reserva NÃO confirmou (webhook paid perdido): pending preso ou cancelled.
  const cutoff = new Date(Date.now() - CUTOFF_MINUTES * 60_000).toISOString();
  const { data: payments, error } = await admin
    .from("payment")
    .select("id, provider_charge_id, booking_id, booking:booking_id!inner(status)")
    .eq("provider", "pagarme")
    .eq("status", "paid")
    .in("booking.status", ["pending", "cancelled"])
    .lt("updated_at", cutoff)
    .limit(100);
  if (error) return json({ error: error.message }, 500);

  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "https://hub.movepark.co";
  let confirmed = 0;
  let refunded = 0;

  for (const p of payments ?? []) {
    try {
      const { data: cr } = await admin.rpc("confirm_or_refund_booking", {
        p_booking_id: p.booking_id,
        p_payment_id: p.id,
      });
      const outcome = (cr as { outcome?: string; charge_id?: string } | null)?.outcome;

      if (outcome === "needs_refund") {
        const chargeId = (cr as { charge_id?: string }).charge_id ?? p.provider_charge_id;
        if (chargeId) {
          await gateway.refundCharge({ chargeId });
          await admin
            .from("payment")
            .update({ refunded_at: new Date().toISOString() })
            .eq("id", p.id);
          refunded += 1;
        }
      } else if (outcome === "confirmed" || outcome === "reconfirmed") {
        // Webhook perdido → o voucher pode não ter sido gerado; gera aqui (idempotente).
        await generateAndStoreVoucher(admin, p.booking_id, siteUrl).catch(() => null);
        confirmed += 1;
      }
    } catch (e) {
      console.error("[reconcile-confirmations] falha em", p.booking_id, e);
    }
  }

  return json({ ok: true, checked: payments?.length ?? 0, confirmed, refunded });
});
