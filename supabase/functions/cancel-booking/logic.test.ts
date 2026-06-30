import { assertEquals } from "jsr:@std/assert";
import {
  freeCancelDeadline,
  FREE_CANCEL_WINDOW_HOURS,
  parseCancelInput,
  refundDecision,
  withinFreeWindow,
} from "./logic.ts";

const NOW = new Date("2026-06-18T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

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

// ── Tarifa (E2.8): a janela vem do snapshot fare_cancel_until, não mais do fixo 24h ──

Deno.test("freeCancelDeadline: usa o snapshot da Tarifa quando há; senão 24h antes do check-in", () => {
  const checkIn = inDays(2);
  // Superflex: snapshot = 1 min antes do check-in
  const superflexUntil = inMinutes(2 * 24 * 60 - 1);
  assertEquals(freeCancelDeadline(checkIn, superflexUntil).toISOString(), superflexUntil);
  // sem snapshot → fallback 24h antes
  const fallback = new Date(new Date(checkIn).getTime() - 24 * 3_600_000);
  assertEquals(freeCancelDeadline(checkIn, null).toISOString(), fallback.toISOString());
});

Deno.test("refundDecision: Superflex estorna a 2h do check-in (janela 1 min)", () => {
  const checkIn = inMinutes(120);
  const fareCancelUntil = inMinutes(119); // 1 min antes do check-in
  const d = refundDecision({
    actor: "customer", bookingStatus: "confirmed", paymentStatus: "paid",
    alreadyRefunded: false, checkInAt: checkIn, fareCancelUntil, now: NOW,
  });
  assertEquals(d, { action: "cancel_with_refund" });
});

Deno.test("refundDecision: Superflex já passou de 1 min antes → sem estorno", () => {
  const checkIn = inMinutes(0.5 / 60); // ~em segundos; já dentro de 1 min
  const fareCancelUntil = inMinutes(-1); // prazo já passou
  const d = refundDecision({
    actor: "customer", bookingStatus: "confirmed", paymentStatus: "paid",
    alreadyRefunded: false, checkInAt: checkIn, fareCancelUntil, now: NOW,
  });
  assertEquals(d, { action: "cancel_no_refund", reason: "late_window" });
});

Deno.test("refundDecision: Flex (snapshot 24h) a 2h do check-in → sem estorno", () => {
  const checkIn = inMinutes(120);
  const fareCancelUntil = new Date(new Date(checkIn).getTime() - 24 * 3_600_000).toISOString();
  const d = refundDecision({
    actor: "customer", bookingStatus: "confirmed", paymentStatus: "paid",
    alreadyRefunded: false, checkInAt: checkIn, fareCancelUntil, now: NOW,
  });
  assertEquals(d, { action: "cancel_no_refund", reason: "late_window" });
});

Deno.test("withinFreeWindow: snapshot da Tarifa tem prioridade sobre o fallback 24h", () => {
  const checkIn = inDays(2);
  // dentro das 24h (fallback diria 'fora'), mas Superflex permite até 1 min antes → dentro
  const now = new Date(new Date(checkIn).getTime() - 2 * 3_600_000); // 2h antes
  const superflexUntil = inMinutes(2 * 24 * 60 - 1);
  assertEquals(withinFreeWindow(checkIn, now, superflexUntil), true);
  assertEquals(withinFreeWindow(checkIn, now, null), false); // fallback 24h
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
