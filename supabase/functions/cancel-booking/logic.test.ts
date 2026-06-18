import { assertEquals } from "jsr:@std/assert";
import {
  FREE_CANCEL_WINDOW_HOURS,
  parseCancelInput,
  refundDecision,
  withinFreeWindow,
} from "./logic.ts";

const NOW = new Date("2026-06-18T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

Deno.test("FREE_CANCEL_WINDOW_HOURS é 24 (trava a regra PRD-12)", () => {
  assertEquals(FREE_CANCEL_WINDOW_HOURS, 24);
});

Deno.test("withinFreeWindow: ≥24h grátis; <24h fora; fronteira exata é grátis", () => {
  assertEquals(withinFreeWindow(inDays(2), NOW), true);
  assertEquals(withinFreeWindow(inDays(0.5), NOW), false); // 12h
  assertEquals(withinFreeWindow(new Date(NOW.getTime() + 24 * 3_600_000).toISOString(), NOW), true);
});

Deno.test("refundDecision: já cancelada → noop (idempotente)", () => {
  const d = refundDecision({ actor: "customer", bookingStatus: "cancelled", paymentStatus: "paid", alreadyRefunded: false, checkInAt: inDays(2), now: NOW });
  assertEquals(d, { action: "noop", reason: "already_cancelled" });
});

Deno.test("refundDecision: status terminal não cancelável → noop", () => {
  for (const s of ["completed", "checked_in", "no_show"]) {
    assertEquals(refundDecision({ actor: "staff", bookingStatus: s, paymentStatus: "paid", alreadyRefunded: false, checkInAt: inDays(2), now: NOW }), {
      action: "noop",
      reason: "not_cancelable",
    });
  }
});

Deno.test("refundDecision: pending → cancela sem estorno", () => {
  const d = refundDecision({ actor: "customer", bookingStatus: "pending", paymentStatus: null, alreadyRefunded: false, checkInAt: inDays(2), now: NOW });
  assertEquals(d, { action: "cancel_no_refund", reason: "pending" });
});

Deno.test("refundDecision: cliente confirmado pago dentro de 24h → estorna", () => {
  const d = refundDecision({ actor: "customer", bookingStatus: "confirmed", paymentStatus: "paid", alreadyRefunded: false, checkInAt: inDays(2), now: NOW });
  assertEquals(d, { action: "cancel_with_refund" });
});

Deno.test("refundDecision: cliente confirmado pago fora de 24h → cancela sem estorno", () => {
  const d = refundDecision({ actor: "customer", bookingStatus: "confirmed", paymentStatus: "paid", alreadyRefunded: false, checkInAt: inDays(0.5), now: NOW });
  assertEquals(d, { action: "cancel_no_refund", reason: "late_window" });
});

Deno.test("refundDecision: staff confirmado pago FORA de 24h → estorna (override)", () => {
  const d = refundDecision({ actor: "staff", bookingStatus: "confirmed", paymentStatus: "paid", alreadyRefunded: false, checkInAt: inDays(0.5), now: NOW });
  assertEquals(d, { action: "cancel_with_refund" });
});

Deno.test("refundDecision: já estornado → cancela sem novo estorno", () => {
  const d = refundDecision({ actor: "staff", bookingStatus: "confirmed", paymentStatus: "refunded", alreadyRefunded: true, checkInAt: inDays(2), now: NOW });
  assertEquals(d, { action: "cancel_no_refund", reason: "already_refunded" });
});

Deno.test("refundDecision: confirmado mas pagamento não-pago → cancela sem estorno", () => {
  const d = refundDecision({ actor: "customer", bookingStatus: "confirmed", paymentStatus: "pending", alreadyRefunded: false, checkInAt: inDays(2), now: NOW });
  assertEquals(d, { action: "cancel_no_refund", reason: "not_paid" });
});

Deno.test("parseCancelInput: exige booking_code; normaliza reason", () => {
  assertEquals(parseCancelInput({}).error, "booking_code é obrigatório.");
  assertEquals(parseCancelInput({ booking_code: "  " }).error, "booking_code é obrigatório.");
  assertEquals(parseCancelInput({ booking_code: "MP-1" }).input, { bookingCode: "MP-1", reason: null });
  assertEquals(parseCancelInput({ booking_code: " MP-2 ", reason: "  desisti " }).input, {
    bookingCode: "MP-2",
    reason: "desisti",
  });
});
