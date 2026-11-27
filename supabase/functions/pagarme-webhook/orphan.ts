// Cobrança que o webhook não acha pelo id (26/11/2026, depois da MP-F00991 e da MP-C365C9).
//
// Na noite de 25/11 o gateway respondeu 500 ao criar o pedido e aprovou a cobrança mesmo assim; o
// aviso de pago chegou 1h15 depois e o webhook o descartava ("payment não encontrado"). Agora:
//   1. `attachUnconfirmedPayment`: se a Edge de cobrança deixou um pagamento SEM ids (a tentativa
//      que ficou sem resposta), a cobrança é pendurada nele e segue o fluxo normal: confirma a
//      reserva, ou reconfirma a expirada se ainda há vaga, ou sinaliza estorno se não há.
//   2. `alertOrphanCharge`: paga e sem pagamento nenhum para pendurar, a equipe fica sabendo
//      (rastro na reserva + e-mail para a caixa de suporte). Ninguém estorna sozinho: o pagamento
//      sem `split` gravado não diz quanto é do parceiro.

import { getEmailConfig, sendEmail, tplOrphanChargeTeam } from "../_shared/email.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { type MatchedPayment, type ParsedEvent, paymentMethodFromGateway } from "./logic.ts";

/**
 * Pendura a cobrança no pagamento sem resposta da mesma reserva, mesmo meio e mesmo valor. A
 * escrita só pega linha ainda sem id (`provider_payment_id is null`), então dois avisos da mesma
 * cobrança não penduram duas vezes, e duas cobranças não caem na mesma linha.
 */
export async function attachUnconfirmedPayment(
  // deno-lint-ignore no-explicit-any
  admin: any,
  ev: ParsedEvent,
  paymentCols: string,
): Promise<MatchedPayment | null> {
  const method = paymentMethodFromGateway(ev.paymentMethod);
  if (!ev.bookingId || !ev.orderId || ev.amountCents == null || method !== "card") return null;
  try {
    const { data: candidatos } = await admin
      .from("payment")
      .select("id")
      .eq("provider", "pagarme")
      .eq("booking_id", ev.bookingId)
      .eq("kind", "booking")
      .eq("method", method)
      .is("provider_payment_id", null)
      .in("status", ["pending", "failed"])
      .eq("amount", ev.amountCents / 100)
      .order("created_at", { ascending: true })
      .limit(5);
    for (const c of (candidatos ?? []) as { id: string }[]) {
      const { data: preso } = await admin
        .from("payment")
        .update({ provider_payment_id: ev.orderId, provider_charge_id: ev.chargeId })
        .eq("id", c.id)
        .is("provider_payment_id", null)
        .select(paymentCols)
        .maybeSingle();
      if (preso) {
        const p = preso as MatchedPayment;
        await logGatewayEvent(admin, {
          paymentId: p.id,
          bookingId: p.booking_id,
          kind: "unconfirmed_attached",
          httpStatus: null,
          request: { order_id: ev.orderId, charge_id: ev.chargeId, event: ev.type },
          note: `a cobrança ${ev.chargeId ?? ev.orderId} apareceu depois do erro do gateway e foi ligada a este pagamento`,
        });
        console.warn("[pagarme-webhook] cobrança sem resposta achou o pagamento:", ev.orderId, p.id);
        return p;
      }
    }
  } catch (e) {
    console.error("[pagarme-webhook] falha ao ligar cobrança sem resposta:", ev.orderId, e);
  }
  return null;
}

/**
 * Cobrança paga sem pagamento no Hub: rastro na reserva e e-mail à equipe, uma vez por cobrança
 * (o gateway manda `charge.paid` e `order.paid` da mesma). Best-effort: nunca lança.
 */
export async function alertOrphanCharge(
  // deno-lint-ignore no-explicit-any
  admin: any,
  ev: ParsedEvent,
): Promise<boolean> {
  const ref = ev.chargeId ?? ev.orderId;
  if (!ref) return false;
  try {
    const { data: ja } = await admin
      .from("payment_gateway_event")
      .select("id")
      .eq("kind", "orphan_charge")
      .eq("request->>ref", ref)
      .limit(1)
      .maybeSingle();
    if (ja) return false;

    // A reserva do metadata pode nem existir (ou ser de outro ambiente): sem ela, o rastro vai solto.
    const { data: bk } = ev.bookingId
      ? await admin.from("booking").select("id, code").eq("id", ev.bookingId).maybeSingle()
      : { data: null };
    const amount = ev.amountCents != null ? ev.amountCents / 100 : null;
    await logGatewayEvent(admin, {
      paymentId: null,
      bookingId: bk?.id ?? null,
      kind: "orphan_charge",
      httpStatus: null,
      request: { ref, order_id: ev.orderId, charge_id: ev.chargeId, event: ev.type, amount_cents: ev.amountCents, method: ev.paymentMethod },
      note: `cobrança paga sem pagamento no Hub: ${ref}${amount != null ? ` (R$ ${amount.toFixed(2)})` : ""}. Conferir e devolver ou ligar à reserva.`,
    });
    console.error("[pagarme-webhook] cobrança paga sem pagamento no Hub:", ref, ev.bookingCode ?? ev.bookingId);

    const [{ data: inboxRow }, cfg] = await Promise.all([
      admin.from("app_setting").select("value").eq("key", "support_inbox").maybeSingle(),
      getEmailConfig(admin),
    ]);
    const to = String(inboxRow?.value ?? "").trim() || cfg.inbox;
    if (!to || !cfg.from) return true;
    const tpl = tplOrphanChargeTeam({
      bookingCode: bk?.code ?? ev.bookingCode,
      chargeId: ev.chargeId,
      orderId: ev.orderId,
      method: ev.paymentMethod,
      amount,
      eventType: ev.type,
    });
    const res = await sendEmail({ from: cfg.from, to, subject: tpl.subject, html: tpl.html });
    if (!res.ok) console.error("[pagarme-webhook] alerta de cobrança sem reserva não saiu:", res.error);
    return true;
  } catch (e) {
    console.error("[pagarme-webhook] falha no alerta de cobrança sem reserva:", ref, e);
    return false;
  }
}
