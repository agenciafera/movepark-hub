import { assertEquals } from "jsr:@std/assert";
import { cancellationRefund, sendBookingCancellationEmail } from "./booking-cancellation.ts";

Deno.test("desfecho da Edge vira a situação que o cliente lê", () => {
  assertEquals(cancellationRefund({ refunded: true, refundPending: false, refundManual: false }), "refunded");
  assertEquals(cancellationRefund({ refunded: true, refundPending: true, refundManual: false }), "pending");
  assertEquals(cancellationRefund({ refunded: false, refundPending: false, refundManual: true }), "manual");
  assertEquals(cancellationRefund({ refunded: false, refundPending: false, refundManual: false }), "none");
});

Deno.test("quem perde a reivindicação não manda (um e-mail por reserva)", async () => {
  let leituras = 0;
  const admin = {
    from: () => ({
      update: () => ({ eq: () => ({ is: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
      select: () => { leituras += 1; return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }; },
    }),
  };
  const sent = await sendBookingCancellationEmail(admin, "b1", { refund: "none", amount: null, method: null, reason: null });
  assertEquals(sent, false);
  assertEquals(leituras, 0);
});
