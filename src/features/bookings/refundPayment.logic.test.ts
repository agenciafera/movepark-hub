import { describe, expect, it } from "vitest";
import { canRefundPayment, isLastLiveBookingPayment } from "./refundPayment.logic";

describe("canRefundPayment", () => {
  it("só pagamento aprovado e sem estorno", () => {
    expect(canRefundPayment({ status: "paid", refunded_at: null })).toBe(true);
    expect(canRefundPayment({ status: "paid", refunded_at: "2026-10-19T12:00:00Z" })).toBe(false);
    expect(canRefundPayment({ status: "failed", refunded_at: null })).toBe(false);
    expect(canRefundPayment({ status: "refunded", refunded_at: null })).toBe(false);
  });
});

describe("isLastLiveBookingPayment", () => {
  const a = { id: "a", kind: "booking", status: "paid", refunded_at: null };
  const b = { id: "b", kind: "booking", status: "paid", refunded_at: null };

  it("cobrança em dobro: nenhuma das duas é a última", () => {
    expect(isLastLiveBookingPayment([a, b], b)).toBe(false);
  });

  it("pagamento único da reserva é o último", () => {
    expect(isLastLiveBookingPayment([a], a)).toBe(true);
    expect(isLastLiveBookingPayment([a, { ...b, status: "failed" }], a)).toBe(true);
    expect(isLastLiveBookingPayment([a, { ...b, refunded_at: "2026-10-19T12:00:00Z" }], a)).toBe(true);
  });

  it("adicional nunca é o último (a reserva tem o próprio pagamento)", () => {
    expect(isLastLiveBookingPayment([a, { ...b, kind: "fare_upgrade" }], { id: "b", kind: "fare_upgrade" })).toBe(false);
  });
});
