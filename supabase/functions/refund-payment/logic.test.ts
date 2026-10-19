import { assertEquals } from "jsr:@std/assert";
import { parseRefundInput, refundPreflight, refundReasonText, refundResponse } from "./logic.ts";

Deno.test("parseRefundInput: exige pagamento e motivo", () => {
  assertEquals(parseRefundInput({ payment_id: "p1", reason: "  cobrança   em dobro " }), {
    paymentId: "p1",
    reason: "cobrança em dobro",
  });
  assertEquals(parseRefundInput({ reason: "cobrança em dobro" }).error, "payment_id é obrigatório.");
  assertEquals(parseRefundInput({ payment_id: "p1", reason: "ok" }).paymentId, null);
  assertEquals(parseRefundInput({ payment_id: "p1", reason: "x".repeat(301) }).paymentId, null);
});

const pago = { provider: "pagarme", status: "paid", refunded_at: null };

Deno.test("refundPreflight: só pagamento aprovado, sem estorno andando e fora da fila manual", () => {
  assertEquals(refundPreflight(pago, false), { ok: true, status: 200 });
  assertEquals(refundPreflight(null, false).status, 404);
  assertEquals(refundPreflight({ ...pago, status: "refunded" }, false).error, "Esse pagamento já está estornado.");
  assertEquals(refundPreflight({ ...pago, status: "pending" }, false).status, 409);
  assertEquals(refundPreflight({ ...pago, status: "failed" }, false).status, 409);
  assertEquals(refundPreflight({ ...pago, refunded_at: "2026-10-19T12:00:00Z" }, false).status, 409);
  assertEquals(refundPreflight(pago, true).status, 409);
  assertEquals(refundPreflight({ ...pago, provider: "mock" }, false).status, 422);
});

Deno.test("refundReasonText: deixa claro no relatório que a reserva ficou", () => {
  assertEquals(refundReasonText("cobrança em dobro"), "estorno avulso (reserva mantida): cobrança em dobro");
});

Deno.test("refundResponse: incerteza não grava, recusa vai para a fila, sucesso responde o status", () => {
  assertEquals(refundResponse("transient", { status: "failed" }).http, 502);
  const recusa = refundResponse("definitive", { status: "failed", failureMessages: ["Saldo insuficiente."] });
  assertEquals(recusa.http, 409);
  assertEquals(recusa.body.manual, true);
  assertEquals(refundResponse("ok", { status: "refunded" }).body, { ok: true, status: "refunded", refund_pending: false });
  assertEquals(refundResponse("ok", { status: "pending" }).body, { ok: true, status: "paid", refund_pending: true });
});
