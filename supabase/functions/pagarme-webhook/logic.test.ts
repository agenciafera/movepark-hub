import { assertEquals } from "jsr:@std/assert";
import {
  parseRecipientEvent,
  parseTransferEvent,
  parseWebhookEvent,
  timingSafeEqual,
  transferStatusToWithdrawalStatus,
  verifyBasicAuth,
} from "./logic.ts";

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
