import { describe, expect, it } from "vitest";
import { lastPayment, paymentState } from "./payment.logic";

const pay = (over: Partial<{ status: string | null; refunded_at: string | null; created_at: string }>) => ({
  status: "paid",
  refunded_at: null,
  created_at: "2026-06-01T00:00:00Z",
  ...over,
});

describe("lastPayment", () => {
  it("pega o mais recente por created_at", () => {
    const a = pay({ created_at: "2026-06-01T00:00:00Z" });
    const b = pay({ created_at: "2026-06-10T00:00:00Z" });
    expect(lastPayment([a, b])).toBe(b);
  });
  it("null quando vazio", () => {
    expect(lastPayment([])).toBeNull();
    expect(lastPayment(null)).toBeNull();
  });
});

describe("paymentState", () => {
  it("pago não estornado → pode estornar, sem badge", () => {
    expect(paymentState([pay({ status: "paid" })])).toEqual({ canRefund: true, badge: null });
  });
  it("estornado → não pode, badge Estornado", () => {
    expect(paymentState([pay({ status: "refunded", refunded_at: "2026-06-05T00:00:00Z" })])).toEqual({
      canRefund: false,
      badge: "Estornado",
    });
  });
  it("PIX estornando (paid + refunded_at) → não pode, badge em processamento", () => {
    expect(paymentState([pay({ status: "paid", refunded_at: "2026-06-05T00:00:00Z" })])).toEqual({
      canRefund: false,
      badge: "Estorno em processamento",
    });
  });
  it("pendente/sem payment → não pode, sem badge", () => {
    expect(paymentState([pay({ status: "pending" })])).toEqual({ canRefund: false, badge: null });
    expect(paymentState([])).toEqual({ canRefund: false, badge: null });
  });
  it("usa o payment mais recente pra decidir", () => {
    const old = pay({ status: "failed", created_at: "2026-06-01T00:00:00Z" });
    const recent = pay({ status: "paid", created_at: "2026-06-10T00:00:00Z" });
    expect(paymentState([old, recent]).canRefund).toBe(true);
  });
});
