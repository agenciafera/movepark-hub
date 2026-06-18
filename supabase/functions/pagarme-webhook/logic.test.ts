import { assertEquals } from "jsr:@std/assert";
import { parseWebhookEvent, timingSafeEqual, verifyBasicAuth } from "./logic.ts";

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
