import { assertEquals } from "jsr:@std/assert";
import {
  decidePaymentStatus,
  type MatchedPayment,
  parseRecipientEvent,
  parseTransferEvent,
  parseWebhookEvent,
  resolvePayment,
  timingSafeEqual,
  transferStatusToWithdrawalStatus,
  verifyBasicAuth,
  webhookIntentFromType,
} from "./logic.ts";

Deno.test("webhookIntentFromType: decide a ação pelo TIPO do evento (não pelo data.status)", () => {
  // Estorno total — o caso PIX que hoje falha: o evento é charge.refunded mas data.status vem "paid".
  assertEquals(webhookIntentFromType("charge.refunded"), "refund");
  assertEquals(webhookIntentFromType("order.refunded"), "refund");
  // Estorno parcial — nome REAL da Pagar.me é `partial_canceled` (partially_refunded é defensivo)
  assertEquals(webhookIntentFromType("charge.partial_canceled"), "partial_refund");
  assertEquals(webhookIntentFromType("charge.partially_refunded"), "partial_refund");
  // Cancelamento (hoje não tratado → booking ficava confirmado)
  assertEquals(webhookIntentFromType("charge.canceled"), "cancel");
  assertEquals(webhookIntentFromType("charge.cancelled"), "cancel");
  assertEquals(webhookIntentFromType("order.canceled"), "cancel");
  // Pagamento
  assertEquals(webhookIntentFromType("charge.paid"), "paid");
  assertEquals(webhookIntentFromType("order.paid"), "paid");
  // Desconhecido → null (cai no mapeamento genérico por status)
  assertEquals(webhookIntentFromType("charge.updated"), null);
  assertEquals(webhookIntentFromType("order.created"), null);
  assertEquals(webhookIntentFromType(""), null);
});

Deno.test("parseRecipientEvent: extrai id e status do recipient.updated", () => {
  const ev = parseRecipientEvent({
    id: "hook_1",
    type: "recipient.updated",
    data: { id: "rp_abc", status: "active", kyc_details: { status: "approved" } },
  });
  assertEquals(ev, { type: "recipient.updated", recipientId: "rp_abc", rawStatus: "active" });
});

Deno.test("parseRecipientEvent: payload vazio → nulos", () => {
  assertEquals(parseRecipientEvent({}), { type: "", recipientId: null, rawStatus: null });
  assertEquals(parseRecipientEvent(null), { type: "", recipientId: null, rawStatus: null });
});

Deno.test("verifyBasicAuth: sem credencial configurada → aceita só fora de produção", () => {
  assertEquals(verifyBasicAuth(null, undefined), true); // required=false (default/staging)
  assertEquals(verifyBasicAuth(null, ""), true);
  assertEquals(verifyBasicAuth(null, undefined, true), false); // produção fail-closed
  assertEquals(verifyBasicAuth(null, "", true), false);
});

Deno.test("verifyBasicAuth: valida o header contra user:pass", () => {
  const expected = "hook:s3cret";
  const header = "Basic " + btoa(expected);
  assertEquals(verifyBasicAuth(header, expected), true);
  assertEquals(verifyBasicAuth(header, expected, true), true); // credencial presente → ok em produção
  assertEquals(verifyBasicAuth("Basic " + btoa("hook:wrong"), expected), false);
  assertEquals(verifyBasicAuth(null, expected), false);
  assertEquals(verifyBasicAuth("Bearer x", expected), false);
});

Deno.test("timingSafeEqual: igual/diferente, inclusive comprimentos distintos", () => {
  assertEquals(timingSafeEqual("abc", "abc"), true);
  assertEquals(timingSafeEqual("abc", "abd"), false);
  assertEquals(timingSafeEqual("abc", "abcd"), false);
  assertEquals(timingSafeEqual("", ""), true);
});

// ── C-12 · Pagamento pago não volta pra pendente ────────────────────────────
// Roteiro: docs/testes/roteiro-consumidor-reserva.md (C-12).

const PAID_AT = "2026-07-20T10:00:00.000Z";

Deno.test("decidePaymentStatus: evento sem intent sobre payment terminal → noop (não rebaixa)", () => {
  for (const current of ["paid", "refunded", "cancelled"]) {
    assertEquals(
      decidePaymentStatus({
        intent: null,
        currentStatus: current,
        paidAt: current === "cancelled" ? null : PAID_AT,
        rawStatus: "waiting_payment",
        eventType: "charge.updated",
      }),
      { action: "noop", reason: "benign_event_on_terminal_payment" },
    );
  }
});

Deno.test("decidePaymentStatus: payment ainda pendente segue o status do evento", () => {
  assertEquals(
    decidePaymentStatus({
      intent: null,
      currentStatus: "pending",
      paidAt: null,
      rawStatus: "waiting_payment",
      eventType: "charge.updated",
    }),
    { action: "update", chargeStatus: "pending", paymentStatus: "pending" },
  );
  assertEquals(
    decidePaymentStatus({
      intent: "paid",
      currentStatus: "pending",
      paidAt: null,
      rawStatus: "paid",
      eventType: "charge.paid",
    }),
    { action: "update", chargeStatus: "paid", paymentStatus: "paid" },
  );
});

Deno.test("decidePaymentStatus: estorno de um pagamento pago continua passando", () => {
  // O estorno é a ÚNICA saída legítima de um pagamento liquidado. A guarda do C-12 não pode
  // bloquear este caminho, senão o estorno de PIX para de refletir no payment.
  assertEquals(
    decidePaymentStatus({
      intent: "refund",
      currentStatus: "paid",
      paidAt: PAID_AT,
      rawStatus: "paid", // a Pagar.me manda `charge.refunded` com data.status "paid"
      eventType: "charge.refunded",
    }),
    { action: "update", chargeStatus: "refunded", paymentStatus: "refunded" },
  );
});

/**
 * ACEITE da tarefa https://app.clickup.com/t/86ajmwb4u (C-12).
 *
 * Este teste FALHA hoje, e é exatamente esse o ponto: o comportamento correto ainda não existe.
 * A guarda atual (`decidePaymentStatus`, ramo `intent === null`) só protege eventos benignos. Um
 * evento COM intent definida atravessa a guarda e rebaixa um pagamento já liquidado. Com o payment
 * de volta em pendente/cancelado, o job de expiração cancela a reserva de quem já pagou. Em
 * produção havia 5 pagamentos com `paid_at` preenchido e `status <> 'paid'` (MP-449353, MP-DB1549,
 * MP-ABB52D, MP-699CF0, MP-81E138), 4 deles com a reserva cancelada e sem estorno.
 *
 * Desmarque o `ignore` no mesmo commit do fix. O fix precisa recusar qualquer transição que saia de
 * 'paid' para algo que não seja estorno, olhando `currentStatus` (e `paidAt` como reforço, já que
 * `paid_at` só é escrito pelo webhook na liquidação).
 */
Deno.test({
  name: "C-12: pagamento pago não é rebaixado por evento posterior com intent definida",
  fn: () => {
    // Cancelamento da ordem chegando depois da liquidação: o payment continua pago.
    assertEquals(
      decidePaymentStatus({
        intent: "cancel",
        currentStatus: "paid",
        paidAt: PAID_AT,
        rawStatus: "canceled",
        eventType: "charge.canceled",
      }),
      { action: "noop", reason: "downgrade_blocked" },
    );
    // Mesma proteção quando o status cru do evento mapeia para pendente/falho.
    for (const raw of ["waiting_payment", "pending", "processing", "with_error", "failed"]) {
      assertEquals(
        decidePaymentStatus({
          intent: "cancel",
          currentStatus: "paid",
          paidAt: PAID_AT,
          rawStatus: raw,
          eventType: "charge.canceled",
        }),
        { action: "noop", reason: "downgrade_blocked" },
        `evento com data.status "${raw}" não pode rebaixar um pagamento liquidado`,
      );
    }
  },
});

Deno.test("parseWebhookEvent: order.paid → orderId = data.id", () => {
  const ev = parseWebhookEvent({
    id: "hook_1",
    type: "order.paid",
    data: { id: "or_1", status: "paid", code: "MP-ABC", metadata: { booking_id: "b1" } },
  });
  assertEquals(ev.eventId, "hook_1");
  assertEquals(ev.type, "order.paid");
  assertEquals(ev.orderId, "or_1");
  assertEquals(ev.bookingId, "b1");
  assertEquals(ev.bookingCode, "MP-ABC");
  assertEquals(ev.rawStatus, "paid");
});

Deno.test("parseWebhookEvent: charge.paid → orderId = data.order_id", () => {
  const ev = parseWebhookEvent({
    id: "hook_2",
    type: "charge.paid",
    data: { id: "ch_1", order_id: "or_9", status: "paid" },
  });
  assertEquals(ev.orderId, "or_9");
});

Deno.test("parseTransferEvent: extrai transfer/recipient/amount/fee/status", () => {
  const tr = parseTransferEvent({
    id: "hook_t1",
    type: "transfer.paid",
    data: { id: "tr_1", recipient_id: "rp_a", amount: 8500, fee: 367, status: "paid" },
  });
  assertEquals(tr.type, "transfer.paid");
  assertEquals(tr.transferId, "tr_1");
  assertEquals(tr.recipientId, "rp_a");
  assertEquals(tr.amountCents, 8500);
  assertEquals(tr.feeCents, 367);
  assertEquals(tr.rawStatus, "paid");
});

Deno.test("parseTransferEvent: recipient aninhado e payload malformado", () => {
  assertEquals(
    parseTransferEvent({ type: "transfer.created", data: { id: "tr_2", recipient: { id: "rp_b" } } }).recipientId,
    "rp_b",
  );
  const empty = parseTransferEvent(null);
  assertEquals(empty.transferId, null);
  assertEquals(empty.recipientId, null);
  assertEquals(empty.amountCents, null);
});

Deno.test("transferStatusToWithdrawalStatus: mapeia os status crus", () => {
  assertEquals(transferStatusToWithdrawalStatus("paid"), "paid");
  assertEquals(transferStatusToWithdrawalStatus("transferred"), "paid");
  assertEquals(transferStatusToWithdrawalStatus("failed"), "failed");
  assertEquals(transferStatusToWithdrawalStatus("processing"), "processing");
  assertEquals(transferStatusToWithdrawalStatus("created"), "created");
  assertEquals(transferStatusToWithdrawalStatus(null), "created");
});

// ── Resolução do payment (86ajnet8w) ────────────────────────────────────────

Deno.test("parseWebhookEvent: charge.* traz orderId (order_id) e chargeId (data.id)", () => {
  const ev = parseWebhookEvent({
    id: "ev_1",
    type: "charge.paid",
    data: { id: "ch_ABC", order_id: "or_XYZ", status: "paid" },
  });
  assertEquals(ev.orderId, "or_XYZ");
  assertEquals(ev.chargeId, "ch_ABC");
});

Deno.test("parseWebhookEvent: order.* traz orderId (data.id) e chargeId da 1ª charge", () => {
  const ev = parseWebhookEvent({
    id: "ev_2",
    type: "order.paid",
    data: { id: "or_XYZ", charges: [{ id: "ch_ABC" }], status: "paid" },
  });
  assertEquals(ev.orderId, "or_XYZ");
  assertEquals(ev.chargeId, "ch_ABC");
});

function fakePayment(id: string, kind: string): MatchedPayment {
  return {
    id,
    booking_id: "bk_1",
    kind,
    fare_target_tier: null,
    date_change_check_in_at: null,
    date_change_check_out_at: null,
    status: "pending",
    paid_at: null,
  };
}

Deno.test("resolvePayment: casa pela ordem (provider_payment_id)", async () => {
  const p = fakePayment("pay_booking", "booking");
  const calls: string[] = [];
  const got = await resolvePayment(
    { orderId: "or_1", chargeId: "ch_1" },
    {
      byOrderId: (o) => {
        calls.push(`order:${o}`);
        return Promise.resolve(o === "or_1" ? p : null);
      },
      byChargeId: (c) => {
        calls.push(`charge:${c}`);
        return Promise.resolve(null);
      },
    },
  );
  assertEquals(got, p);
  // achou pela ordem → nem consulta o charge
  assertEquals(calls, ["order:or_1"]);
});

Deno.test("resolvePayment: ordem não casa → desempata pelo charge (nunca por recência)", async () => {
  // Cenário do C-16: reserva com duas cobranças. O evento é da cobrança do UPGRADE, cuja ordem não
  // bateu no match primário; o charge id é único e aponta pro payment certo, não pro mais recente.
  const upgrade = fakePayment("pay_upgrade", "fare_upgrade");
  const got = await resolvePayment(
    { orderId: "or_desconhecida", chargeId: "ch_upgrade" },
    {
      byOrderId: () => Promise.resolve(null),
      byChargeId: (c) => Promise.resolve(c === "ch_upgrade" ? upgrade : null),
    },
  );
  assertEquals(got, upgrade);
});

Deno.test("resolvePayment: sem match por ordem nem charge → null (não aplica no errado)", async () => {
  const got = await resolvePayment(
    { orderId: "or_nao_existe", chargeId: "ch_nao_existe" },
    {
      byOrderId: () => Promise.resolve(null),
      byChargeId: () => Promise.resolve(null),
    },
  );
  // O ponto da tarefa: melhor não achar do que aplicar na cobrança mais recente do booking.
  assertEquals(got, null);
});

Deno.test("resolvePayment: sem identificadores → null sem consultar nada", async () => {
  let consultou = false;
  const got = await resolvePayment(
    { orderId: null, chargeId: null },
    {
      byOrderId: () => {
        consultou = true;
        return Promise.resolve(fakePayment("x", "booking"));
      },
      byChargeId: () => {
        consultou = true;
        return Promise.resolve(fakePayment("x", "booking"));
      },
    },
  );
  assertEquals(got, null);
  assertEquals(consultou, false);
});
