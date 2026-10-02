import { describe, expect, it } from "vitest";
import { bookingStateSummary, customerBlockCopy, customerPaymentState } from "./bookingState.logic";

const fmt = { dateTime: (iso: string) => `D(${iso})`, brl: (v: number) => `R$ ${v.toFixed(2)}` };
const pago = { status: "paid", refunded_at: null, paid_at: "2026-09-21T20:11:00Z", created_at: "2026-09-21T20:10:00Z", method: "pix" };

describe("customerPaymentState", () => {
  it("lê o último pagamento e cai no status da reserva sem pagamento", () => {
    expect(customerPaymentState([pago], "confirmed")).toBe("paid");
    expect(customerPaymentState([{ ...pago, status: "refunded" }], "cancelled")).toBe("refunded");
    expect(customerPaymentState([{ ...pago, refunded_at: "2026-09-22T00:00:00Z" }], "cancelled")).toBe("refunding");
    expect(customerPaymentState([{ ...pago, status: "failed" }], "pending")).toBe("failed");
    expect(customerPaymentState([], "pending")).toBe("awaiting");
    expect(customerPaymentState(null, "expired")).toBe("unpaid");
  });
});

describe("bookingStateSummary", () => {
  it("expirada diz que nada foi cobrado e até quando podia pagar", () => {
    const s = bookingStateSummary({ status: "expired", expires_at: "2026-10-01T23:36:00Z" }, [], fmt);
    expect(s.title).toBe("Expirada sem pagamento");
    expect(s.detail).toContain("D(2026-10-01T23:36:00Z)");
    expect(s.detail).toContain("Nada foi cobrado");
    expect(s.payment).toBe("unpaid");
  });
  it("paga mostra o meio e a hora", () => {
    const s = bookingStateSummary({ status: "confirmed" }, [pago], fmt);
    expect(s.title).toBe("Paga no PIX em D(2026-09-21T20:11:00Z)");
    expect(s.tone).toBe("confirmed");
  });
  it("cancelada com estorno diz o valor devolvido", () => {
    const s = bookingStateSummary({ status: "cancelled", deleted_at: "2026-09-22T10:00:00Z", total_amount: 48.9 }, [{ ...pago, status: "refunded" }], fmt);
    expect(s.title).toBe("Cancelada e devolvida");
    expect(s.detail).toContain("R$ 48.90 devolvidos");
  });
  it("cancelada paga sem estorno aponta a devolução pendente", () => {
    expect(bookingStateSummary({ status: "cancelled" }, [pago], fmt).title).toBe("Cancelada, devolução pendente");
  });
  it("pendente diz até quando o cliente pode pagar", () => {
    expect(bookingStateSummary({ status: "pending", expires_at: "2026-10-02T00:00:00Z" }, [], fmt).detail).toContain("até D(2026-10-02T00:00:00Z)");
  });
});

describe("customerBlockCopy", () => {
  it("só diz 'pagou' quando pagou", () => {
    expect(customerBlockCopy("paid", "PIX", 1, "confirmed")).toEqual({ title: "O cliente pagou", hint: "PIX" });
    expect(customerBlockCopy("paid", "cartão", 3, "confirmed").hint).toBe("cartão em 3x");
    expect(customerBlockCopy("unpaid", null, null, "expired")).toEqual({ title: "Valor da reserva", hint: "não pago: a reserva expirou" });
    expect(customerBlockCopy("awaiting", null, null, "pending").title).toBe("O cliente vai pagar");
    expect(customerBlockCopy("refunded", "PIX", 1, "cancelled").title).toBe("O cliente pagou e foi devolvido");
  });
});
