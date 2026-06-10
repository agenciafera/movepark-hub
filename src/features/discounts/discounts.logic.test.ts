import { describe, expect, it } from "vitest";
import {
  buildDiscountUpsertArgs,
  discountWindowLabel,
  EMPTY_DISCOUNT_FORM,
  formatDiscountValue,
  isoToDateInput,
  validateDiscountForm,
  type DiscountFormValues,
} from "./discounts.logic";

const base: DiscountFormValues = {
  ...EMPTY_DISCOUNT_FORM,
  name: "Promo 20",
  discount_type: "percent",
  discount_value: 20,
};

describe("validateDiscountForm", () => {
  it("exige nome", () => {
    expect(validateDiscountForm({ ...base, name: "  " })).toMatch(/[Nn]ome/);
  });
  it("exige valor > 0", () => {
    expect(validateDiscountForm({ ...base, discount_value: 0 })).toMatch(/maior que zero/);
  });
  it("rejeita percent > 100", () => {
    expect(validateDiscountForm({ ...base, discount_value: 150 })).toMatch(/100%/);
  });
  it("aceita fixed alto", () => {
    expect(validateDiscountForm({ ...base, discount_type: "fixed", discount_value: 500 })).toBeNull();
  });
  it("rejeita advance negativo e janela invertida", () => {
    expect(validateDiscountForm({ ...base, advance_days: -1 })).toMatch(/[Aa]ntecedência/);
    expect(
      validateDiscountForm({ ...base, valid_from: "2026-08-10", valid_until: "2026-08-01" }),
    ).toMatch(/anterior/);
  });
  it("aceita um form válido", () => {
    expect(validateDiscountForm(base)).toBeNull();
  });
});

describe("buildDiscountUpsertArgs", () => {
  it("converte datas, null em 'todas as unidades' e restrições vazias", () => {
    const args = buildDiscountUpsertArgs("c1", null, {
      ...base,
      location_id: null,
      valid_from: "2026-08-01",
      valid_until: "2026-08-31",
      parking_type_ids: [],
    });
    expect(args.p_location_id).toBeNull();
    expect(args.p_valid_from).toBe("2026-08-01T00:00:00");
    expect(args.p_valid_until).toBe("2026-08-31T23:59:59");
    expect(args.p_parking_type_ids).toBeNull();
    expect(args.p_allow_coupon_stack).toBe(true);
  });
  it("preserva id, unidade e tipos de vaga na edição", () => {
    const args = buildDiscountUpsertArgs("c1", "r1", {
      ...base,
      location_id: "loc1",
      allow_coupon_stack: false,
      parking_type_ids: ["a", "b"],
    });
    expect(args.p_id).toBe("r1");
    expect(args.p_location_id).toBe("loc1");
    expect(args.p_allow_coupon_stack).toBe(false);
    expect(args.p_parking_type_ids).toEqual(["a", "b"]);
  });
});

describe("formatDiscountValue", () => {
  it("percent vira X% OFF", () => {
    expect(formatDiscountValue("percent", 20)).toBe("20% OFF");
  });
  it("fixed vira moeda BRL", () => {
    expect(formatDiscountValue("fixed", 5)).toContain("5,00");
  });
});

describe("discountWindowLabel", () => {
  it("sem janela", () => {
    expect(discountWindowLabel(null, null)).toBe("Sempre");
  });
  it("com início e fim usa seta", () => {
    expect(discountWindowLabel("2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z")).toContain("→");
  });
});

describe("isoToDateInput", () => {
  it("recorta a data do ISO; nulo vira vazio", () => {
    expect(isoToDateInput("2026-08-01T00:00:00+00:00")).toBe("2026-08-01");
    expect(isoToDateInput(null)).toBe("");
  });
});
