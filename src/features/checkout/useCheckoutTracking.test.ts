import { afterEach, describe, expect, it } from "vitest";
import { markPurchaseTracked } from "@/lib/analytics-ecommerce";
import { shouldTrackBeginCheckout, shouldTrackPurchase } from "./useCheckoutTracking";

afterEach(() => {
  localStorage.clear();
});

const agora = new Date("2026-12-10T12:00:00Z");
const pago = { id: "p1", status: "paid" as const, provider: "pagarme", method: "pix", paid_at: "2026-12-10T11:55:00Z" };

describe("begin_checkout", () => {
  it("sai com a reserva pendente e dentro do prazo", () => {
    expect(shouldTrackBeginCheckout({ code: "MP-1", status: "pending", expires_at: null }, null)).toBe(true);
  });
  it("não repete para a mesma reserva", () => {
    expect(shouldTrackBeginCheckout({ code: "MP-1", status: "pending", expires_at: null }, "MP-1")).toBe(false);
  });
  it("não sai para reserva confirmada nem expirada", () => {
    expect(shouldTrackBeginCheckout({ code: "MP-1", status: "confirmed", expires_at: null }, null)).toBe(false);
    expect(
      shouldTrackBeginCheckout({ code: "MP-1", status: "pending", expires_at: "2020-01-01T00:00:00Z" }, null),
    ).toBe(false);
  });
});

describe("purchase", () => {
  const confirmada = { code: "MP-1", status: "confirmed" as const, created_at: "2026-12-10T11:30:00Z", payment: pago };

  it("espera o histórico (new_customer depende dele)", () => {
    expect(shouldTrackPurchase(confirmada, false, agora)).toBe(false);
    expect(shouldTrackPurchase(confirmada, true, agora)).toBe(true);
  });
  it("uma vez por navegador: recarregar a confirmação não compra de novo", () => {
    markPurchaseTracked("MP-1");
    expect(shouldTrackPurchase(confirmada, true, agora)).toBe(false);
  });
  it("reserva pendente não é compra", () => {
    expect(shouldTrackPurchase({ ...confirmada, status: "pending" }, true, agora)).toBe(false);
  });
});
