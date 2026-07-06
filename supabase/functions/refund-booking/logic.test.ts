import { assertEquals } from "jsr:@std/assert";
import { parseRefundInput, refundDecision } from "./logic.ts";

Deno.test("parseRefundInput: exige booking_code, trima e normaliza reason", () => {
  assertEquals(parseRefundInput({ booking_code: "MP-1", reason: "  duplicado " }), {
    input: { bookingCode: "MP-1", reason: "duplicado" },
  });
  assertEquals(parseRefundInput({ booking_code: "MP-2" }).input, {
    bookingCode: "MP-2",
    reason: null,
  });
  assertEquals(parseRefundInput({ reason: "x" }).error, "booking_code é obrigatório.");
  assertEquals(parseRefundInput({ booking_code: "  " }).error, "booking_code é obrigatório.");
  assertEquals(parseRefundInput(null).error, "booking_code é obrigatório.");
});

Deno.test("refundDecision: estorna paga, noop se já estornada, rejeita sem pagamento/não-paga", () => {
  assertEquals(refundDecision({ paymentStatus: "paid", alreadyRefunded: false }), {
    action: "refund",
  });
  assertEquals(refundDecision({ paymentStatus: "paid", alreadyRefunded: true }), {
    action: "noop",
    reason: "already_refunded",
  });
  assertEquals(refundDecision({ paymentStatus: null, alreadyRefunded: false }), {
    action: "reject",
    reason: "no_payment",
  });
  assertEquals(refundDecision({ paymentStatus: "pending", alreadyRefunded: false }), {
    action: "reject",
    reason: "not_paid",
  });
  // independe do status da reserva — uma reserva concluída com payment pago é estornável
  assertEquals(refundDecision({ paymentStatus: "paid", alreadyRefunded: false }).action, "refund");
});
