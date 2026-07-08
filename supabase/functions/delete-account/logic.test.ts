import { assertEquals } from "jsr:@std/assert";
import { anonymizedEmail, isActiveBooking, voucherObjectPath, PERMANENT_BAN_DURATION } from "./logic.ts";

Deno.test("anonymizedEmail: placeholder único por uid, domínio inválido", () => {
  assertEquals(anonymizedEmail("abc-123"), "deleted-abc-123@anonymized.movepark.invalid");
});

Deno.test("voucherObjectPath: <booking_id>.pdf (convenção do bucket vouchers)", () => {
  assertEquals(voucherObjectPath("bk-1"), "bk-1.pdf");
});

Deno.test("PERMANENT_BAN_DURATION: ban praticamente permanente", () => {
  assertEquals(PERMANENT_BAN_DURATION, "876000h");
});

Deno.test("isActiveBooking: pending/confirmed no futuro são ativas", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  const future = "2026-07-20T12:00:00Z";
  assertEquals(isActiveBooking("pending", future, now), true);
  assertEquals(isActiveBooking("confirmed", future, now), true);
});

Deno.test("isActiveBooking: passadas ou terminais NÃO são ativas", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  const past = "2026-07-01T12:00:00Z";
  // já terminou → não cancela (mantém como venda)
  assertEquals(isActiveBooking("confirmed", past, now), false);
  // status terminal → nunca ativa
  assertEquals(isActiveBooking("cancelled", "2026-07-20T12:00:00Z", now), false);
  assertEquals(isActiveBooking("completed", "2026-07-20T12:00:00Z", now), false);
});
