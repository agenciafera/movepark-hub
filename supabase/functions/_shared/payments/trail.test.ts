import { assertEquals } from "jsr:@std/assert";
import { trailRow } from "./trail.ts";

Deno.test("trailRow: liga ao pagamento e à reserva e guarda pedido e resposta como vieram", () => {
  const row = trailRow({ paymentId: "p1", bookingId: "b1", kind: "refund", httpStatus: 200, request: { amount: 1800 }, response: { id: "ch_1" } });
  assertEquals(row, { payment_id: "p1", booking_id: "b1", provider: "pagarme", kind: "refund", http_status: 200, request: { amount: 1800 }, response: { id: "ch_1" }, note: null });
});

Deno.test("trailRow: sem status e sem corpo vira nulo, não undefined (o insert precisa de json)", () => {
  const row = trailRow({ paymentId: null, bookingId: "b1", kind: "webhook:charge.paid", httpStatus: undefined });
  assertEquals(row.http_status, null);
  assertEquals(row.request, null);
  assertEquals(row.response, null);
});
