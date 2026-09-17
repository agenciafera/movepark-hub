import { describe, expect, it } from "vitest";
import { lastPayment, paymentLine, paymentState, refundWindow } from "./payment.logic";

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

describe("refundWindow", () => {
  const agora = new Date("2026-09-17T12:00:00Z");
  it("PIX: 90 dias do pagamento; cartão: 180", () => {
    const pix = refundWindow([{ status: "paid", method: "pix", paid_at: "2026-09-01T12:00:00Z", created_at: "2026-09-01T12:00:00Z" }], agora)!;
    expect(pix.method).toBe("pix");
    expect(pix.deadline.toISOString()).toBe("2026-11-30T12:00:00.000Z");
    expect(pix.expired).toBe(false);
    expect(pix.daysLeft).toBe(74);
    const card = refundWindow([{ status: "paid", method: "card", paid_at: "2026-01-01T12:00:00Z", created_at: "2026-01-01T12:00:00Z" }], agora)!;
    expect(card.deadline.toISOString()).toBe("2026-06-30T12:00:00.000Z");
    expect(card.expired).toBe(true);
    expect(card.daysLeft).toBeLessThan(0);
  });
  it("sem pagamento pago, ou sem método conhecido, não há janela", () => {
    expect(refundWindow([], agora)).toBeNull();
    expect(refundWindow([{ status: "pending", method: "pix", paid_at: null, created_at: "2026-09-01T12:00:00Z" }], agora)).toBeNull();
    expect(refundWindow([{ status: "paid", method: "boleto", paid_at: "2026-09-01T12:00:00Z", created_at: "2026-09-01T12:00:00Z" }], agora)).toBeNull();
  });
});

describe("paymentLine", () => {
  it("diz o meio e o estado do dinheiro em uma frase", () => {
    expect(paymentLine([pay({ status: "paid", method: "pix" } as never)], "confirmed")).toBe("Pago no PIX");
    expect(paymentLine([pay({ status: "refunded", method: "card" } as never)], "cancelled")).toBe("Pago no cartão, devolvido ao cliente");
    expect(paymentLine([pay({ status: "paid", refunded_at: "2026-09-17T00:00:00Z", method: "pix" } as never)], "cancelled")).toBe("Pago no PIX, estorno em processamento");
  });

  it("cancelada com pagamento pago e sem estorno: a devolução está com a Movepark (fila manual)", () => {
    expect(paymentLine([pay({ status: "paid", method: "card" } as never)], "cancelled")).toBe("Pago no cartão, devolução pendente com a Movepark");
  });

  it("sem pagamento, pendente ou recusado", () => {
    expect(paymentLine([], "pending")).toBe("Aguardando pagamento");
    expect(paymentLine([], "cancelled")).toBe("Sem pagamento");
    expect(paymentLine([pay({ status: "failed" })], "pending")).toBe("Pagamento recusado");
    expect(paymentLine([pay({ status: "pending" })], "pending")).toBe("Aguardando pagamento");
  });
});
