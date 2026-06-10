import { describe, expect, it } from "vitest";
import { couponDiscountLabel, couponErrorMessage } from "./coupon.logic";

describe("couponErrorMessage", () => {
  it("colapsa motivos sensíveis em mensagem genérica", () => {
    expect(couponErrorMessage("invalid")).toBe("Cupom inválido ou expirado");
    expect(couponErrorMessage("inactive")).toBe("Cupom inválido ou expirado");
    expect(couponErrorMessage(null)).toBe("Cupom inválido ou expirado");
    expect(couponErrorMessage("desconhecido")).toBe("Cupom inválido ou expirado");
  });
  it("mensagens específicas", () => {
    expect(couponErrorMessage("expired")).toMatch(/expirado/);
    expect(couponErrorMessage("exhausted")).toMatch(/esgotado/);
    expect(couponErrorMessage("not_yet_valid")).toMatch(/ainda não/);
    expect(couponErrorMessage("min_amount")).toMatch(/maior valor/);
    expect(couponErrorMessage("min_days")).toMatch(/mais longas/);
    expect(couponErrorMessage("already_used")).toMatch(/já utilizou/);
    expect(couponErrorMessage("not_eligible_type")).toMatch(/tipo de vaga/);
  });
});

describe("couponDiscountLabel", () => {
  it("percent mostra X% OFF", () => {
    expect(couponDiscountLabel({ discount_type: "percent", discount_value: 10, discount: 9 })).toBe(
      "10% OFF",
    );
  });
  it("fixed mostra valor negativo em BRL", () => {
    expect(couponDiscountLabel({ discount_type: "fixed", discount_value: 5, discount: 5 })).toContain(
      "5,00",
    );
  });
  it("sem tipo cai no valor", () => {
    expect(couponDiscountLabel({ discount: 7 })).toContain("7,00");
  });
});
