// Tentativa imediata na confirmação do pagamento (docs/specs/integracoes.md § 5.6).
//
// O trigger `booking_integration_enqueue` já criou a entrega quando a reserva virou `confirmed`.
// Aqui ela é reivindicada e processada na hora, com prazo curto, para o código da cancela chegar
// antes do voucher e do e-mail. Se não der, o cron `integration-deliver` segue tentando e o
// e-mail espera até 15 minutos. Nunca lança: não pode derrubar a confirmação.

import { processDelivery, type ClaimedDelivery } from "./process.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

const INLINE_TIMEOUT_MS = 10_000;

export async function ensureAccessCode(admin: Admin, bookingId: string): Promise<void> {
  try {
    const { data: pend } = await admin
      .from("integration_delivery")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("status", "pending")
      .limit(5);
    for (const p of (pend ?? []) as { id: string }[]) {
      const { data: rows } = await admin.rpc("integration_delivery_claim", {
        p_limit: 1,
        p_lease: "2 minutes",
        p_delivery_id: p.id,
      });
      for (const d of (rows ?? []) as ClaimedDelivery[]) {
        await processDelivery(admin, d, { timeoutMs: INLINE_TIMEOUT_MS });
      }
    }
  } catch (e) {
    console.error("[integrations] tentativa imediata falhou:", bookingId, e);
  }
}
