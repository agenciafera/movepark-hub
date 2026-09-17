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
import { executeRefund, partnerRecipientMissing, persistPartnerBalance } from "../_shared/payments/refund.ts";
import { loadGatewaySettings } from "../_shared/payments/settings.ts";
import { autorizado, BATCH_LIMIT, confirmationCutoffIso, decidirAcao } from "./logic.ts";
import { generateAndStoreVoucher } from "../_shared/voucher/pdf.ts";
import { siteUrl } from "../_shared/site.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";

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
  const { data: expected } = await admin.rpc("reconcile_confirmations_expected_key");
  if (!autorizado(expected, req.headers.get("x-reconcile-confirmations-key"))) {
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
  const cutoff = confirmationCutoffIso(Date.now());
  const { data: payments, error } = await admin
    .from("payment")
    .select("id, provider_charge_id, booking_id, amount, split, split_sent_to_gateway, debt_recovered_cents, booking:booking_id!inner(status)")
    .eq("provider", "pagarme")
    .eq("status", "paid")
    // `expired` entra aqui porque é onde cai a reserva cujo pagamento só foi descoberto depois:
    // o cron expirou a reserva enquanto o pagamento estava pendente, e o
    // reconcile-pending-charges marcou pago depois. Sem este status, a linha ficaria paga e
    // não entregue, contando como dívida com o parceiro e sem ninguém para estornar.
    .in("booking.status", ["pending", "cancelled", "expired"])
    // Cancelamento intencional com estorno recusado (fila manual) NÃO é "webhook perdido": o
    // pagamento fica `paid` de propósito até a devolução sair. Reconfirmar aqui ressuscitava a
    // reserva que o staff acabou de cancelar (MP-6CFA4B, 17/09/2026).
    .is("refund_reason", null)
    .lt("updated_at", cutoff)
    .limit(BATCH_LIMIT);
  if (error) return json({ error: error.message }, 500);

  const { data: filaManual } = await admin
    .from("payout_refund_manual")
    .select("payment_id")
    .eq("status", "pending");
  const naFila = new Set((filaManual ?? []).map((r: { payment_id: string }) => r.payment_id));

  const site = siteUrl();
  const settings = await loadGatewaySettings(admin);
  let confirmed = 0;
  let refunded = 0;

  for (const p of payments ?? []) {
    if (naFila.has(p.id)) continue; // devolução pendente na fila manual: não é para reconfirmar
    try {
      const { data: cr } = await admin.rpc("confirm_or_refund_booking", {
        p_booking_id: p.booking_id,
        p_payment_id: p.id,
      });
      const r = cr as { outcome?: string; charge_id?: string } | null;
      // A decisão mora em logic.ts, sob teste. Aqui fica só a execução.
      const acao = decidirAcao(r?.outcome, r?.charge_id, p.provider_charge_id);

      if (acao.tipo === "estornar") {
        // E0.3.5: 100% master quando a cobrança foi com split; a perna do parceiro vira dívida.
        const exec = await executeRefund({
          gateway,
          chargeId: acao.chargeId,
          payment: p,
          moveparkRecipientId: settings.moveparkRecipientId,
          totalCents: Math.round(Number(p.amount) * 100),
          hybridEnabled: settings.refundHybridEnabled,
          partnerRecipientMissing: await partnerRecipientMissing(admin, p),
        });
        await persistPartnerBalance(admin, exec);
        await logGatewayEvent(admin, {
          paymentId: p.id,
          bookingId: p.booking_id ?? null,
          kind: "refund",
          httpStatus: exec.result.httpStatus,
          request: { amount_cents: Math.round(Number(p.amount) * 100), split: exec.splitSent ?? null, mode: exec.mode, reason: exec.reason },
          response: exec.result.raw,
          note: "pago sem vaga (conciliação)",
        });
        if (exec.outcome !== "ok") {
          console.error("[reconcile-confirmations] estorno recusado:", p.id, exec.result.httpStatus, JSON.stringify(exec.result.raw));
          continue;
        }
        await admin
          .from("payment")
          .update({
            refunded_at: new Date().toISOString(),
            refund_absorbed_by_master: exec.absorbedByMaster,
            refund_split: exec.splitSent ?? null,
            refund_partner_cents: exec.partnerCents,
            refund_partner_balance_cents: exec.partnerBalanceCents,
...(exec.gatewayFeeCents == null ? {} : { gateway_fee_cents: exec.gatewayFeeCents }),
          })
          .eq("id", p.id);
        refunded += 1;
      } else if (acao.tipo === "confirmar") {
        // Webhook perdido → o voucher pode não ter sido gerado; gera aqui (idempotente).
        await generateAndStoreVoucher(admin, p.booking_id, site).catch(() => null);
        confirmed += 1;
      }
    } catch (e) {
      console.error("[reconcile-confirmations] falha em", p.booking_id, e);
    }
  }

  return json({ ok: true, checked: payments?.length ?? 0, confirmed, refunded });
});
