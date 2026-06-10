import { describe, expect, it } from "vitest";
import {
  buildCouponUpsertArgs,
  EMPTY_COUPON_FORM,
  formatDiscount,
  formatUsage,
  isoToDateInput,
  validateCouponForm,
  type CouponFormValues,
} from "./coupons.logic";

const base: CouponFormValues = {
  ...EMPTY_COUPON_FORM,
  code: "promo10",
  discount_type: "percent",
  discount_value: 10,
};

describe("validateCouponForm", () => {
  it("exige código", () => {
    expect(validateCouponForm({ ...base, code: "  " })).toMatch(/[Cc]ódigo/);
  });
  it("exige valor > 0", () => {
    expect(validateCouponForm({ ...base, discount_value: 0 })).toMatch(/maior que zero/);
  });
  it("rejeita percent > 100", () => {
    expect(validateCouponForm({ ...base, discount_value: 150 })).toMatch(/100%/);
  });
  it("aceita fixed alto (não limitado a 100)", () => {
    expect(validateCouponForm({ ...base, discount_type: "fixed", discount_value: 500 })).toBeNull();
  });
  it("rejeita janela de validade invertida", () => {
    expect(
      validateCouponForm({ ...base, valid_from: "2026-07-10", valid_until: "2026-07-01" }),
    ).toMatch(/anterior/);
  });
  it("rejeita limites não positivos", () => {
    expect(validateCouponForm({ ...base, max_uses: 0 })).toMatch(/usos/);
    expect(validateCouponForm({ ...base, per_user_limit: 0 })).toMatch(/usuário/);
    expect(validateCouponForm({ ...base, min_days: 0 })).toMatch(/[Dd]iárias/);
  });
  it("aceita um form válido", () => {
    expect(validateCouponForm(base)).toBeNull();
  });
});

describe("buildCouponUpsertArgs", () => {
  it("normaliza code UPPERCASE e converte datas + nulos", () => {
    const args = buildCouponUpsertArgs("c1", null, {
      ...base,
      code: " promo10 ",
      description: "  ",
      valid_from: "2026-07-01",
      valid_until: "2026-07-31",
      parking_type_ids: [],
    });
    expect(args.p_code).toBe("PROMO10");
    expect(args.p_description).toBeNull();
    expect(args.p_valid_from).toBe("2026-07-01T00:00:00");
    expect(args.p_valid_until).toBe("2026-07-31T23:59:59");
    expect(args.p_parking_type_ids).toBeNull();
    expect(args.p_id).toBeNull();
  });
  it("preserva id na edição e passa restrições de tipo de vaga", () => {
    const args = buildCouponUpsertArgs("c1", "cup1", { ...base, parking_type_ids: ["a", "b"] });
    expect(args.p_id).toBe("cup1");
    expect(args.p_parking_type_ids).toEqual(["a", "b"]);
  });
});

describe("formatDiscount", () => {
  it("percent vira X% OFF", () => {
    expect(formatDiscount("percent", 10)).toBe("10% OFF");
  });
  it("fixed vira moeda BRL", () => {
    expect(formatDiscount("fixed", 5)).toContain("5,00");
  });
});

describe("formatUsage", () => {
  it("com limite", () => {
    expect(formatUsage(3, 100)).toBe("3 / 100");
  });
  it("ilimitado", () => {
    expect(formatUsage(3, null)).toBe("3 / ∞");
  });
});

describe("isoToDateInput", () => {
  it("recorta a data do ISO", () => {
    expect(isoToDateInput("2026-07-01T00:00:00+00:00")).toBe("2026-07-01");
  });
  it("nulo vira string vazia", () => {
    expect(isoToDateInput(null)).toBe("");
  });
});
