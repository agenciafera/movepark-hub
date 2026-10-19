// Rede de segurança da cobrança em dobro (19/10/2026, depois da MP-07DAE9).
//
// A trava de cobrança (payment_charge_lock) impede duas cobranças simultâneas e o cartão aprovado
// anula o PIX que ficou aberto. Mesmo assim, um PIX pago no instante em que o cartão aprova ainda
// pode deixar a reserva com dois pagamentos. Aqui não se estorna sozinho: quem devolve é gente.
// O que este módulo garante é que ninguém fique sem saber: rastro na reserva (aparece no Manager)
// e e-mail para a caixa de suporte.

import { getEmailConfig, sendEmail, tplDuplicatePaymentTeam } from "../email.ts";
import { logGatewayEvent } from "./trail.ts";

export interface LiveBookingPayment {
  id: string;
  method: string | null;
  amount: number | string | null;
  provider_charge_id: string | null;
  paid_at: string | null;
}

/** Nota curta do rastro: uma linha por cobrança aprovada. */
export function duplicateTrailNote(rows: LiveBookingPayment[]): string {
  const itens = rows.map((r) => `${r.provider_charge_id ?? r.id} (${r.method ?? "?"}, R$ ${Number(r.amount ?? 0).toFixed(2)})`);
  return `cobrança em dobro: ${rows.length} pagamentos aprovados na mesma reserva: ${itens.join("; ")}. Devolver a cópia.`;
}

/**
 * Confere se a reserva ficou com mais de um pagamento da reserva aprovado e, se ficou, avisa.
 * Best-effort: nunca lança (roda depois da resposta do webhook).
 */
export async function alertIfDuplicatePayment(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bookingId: string,
  paymentId: string,
): Promise<boolean> {
  try {
    const { data: rows, error } = await admin
      .from("payment")
      .select("id, method, amount, provider_charge_id, paid_at")
      .eq("booking_id", bookingId)
      .eq("kind", "booking")
      .in("status", ["paid", "authorized"])
      .order("created_at", { ascending: true });
    if (error || !rows || rows.length < 2) return false;
    const live = rows as LiveBookingPayment[];

    await logGatewayEvent(admin, {
      paymentId,
      bookingId,
      kind: "duplicate_payment",
      httpStatus: null,
      note: duplicateTrailNote(live),
    });
    console.error("[duplicate] cobrança em dobro na reserva", bookingId, live.map((r) => r.provider_charge_id));

    const [{ data: bk }, { data: inboxRow }, cfg] = await Promise.all([
      admin.from("booking").select("code").eq("id", bookingId).maybeSingle(),
      admin.from("app_setting").select("value").eq("key", "support_inbox").maybeSingle(),
      getEmailConfig(admin),
    ]);
    const to = String(inboxRow?.value ?? "").trim() || cfg.inbox;
    if (!to || !cfg.from || !bk?.code) return true;
    const tpl = tplDuplicatePaymentTeam({
      bookingCode: bk.code,
      charges: live.map((r) => ({
        chargeId: r.provider_charge_id,
        method: r.method ?? "?",
        amount: Number(r.amount ?? 0),
        paidAt: r.paid_at,
      })),
    });
    const res = await sendEmail({ from: cfg.from, to, subject: tpl.subject, html: tpl.html });
    if (!res.ok) console.error("[duplicate] alerta por e-mail não saiu:", res.error);
    return true;
  } catch (e) {
    console.error("[duplicate] falha ao conferir cobrança em dobro:", bookingId, e);
    return false;
  }
}
