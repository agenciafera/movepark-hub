import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeCouponCode,
  parseCouponParam,
  captureCouponFromSearch,
  getStoredCoupon,
  storeCoupon,
  clearStoredCoupon,
} from "./coupon";

afterEach(() => sessionStorage.clear());

describe("normalizeCouponCode", () => {
  it("trim + UPPERCASE; vazio → null", () => {
    expect(normalizeCouponCode("  volta10 ")).toBe("VOLTA10");
    expect(normalizeCouponCode("")).toBeNull();
    expect(normalizeCouponCode("   ")).toBeNull();
    expect(normalizeCouponCode(null)).toBeNull();
    expect(normalizeCouponCode(undefined)).toBeNull();
  });
});

describe("parseCouponParam", () => {
  it("lê ?cupom= e ?coupon= (normalizado)", () => {
    expect(parseCouponParam("?cupom=volta10")).toBe("VOLTA10");
    expect(parseCouponParam("?coupon=Volta10")).toBe("VOLTA10");
  });
  it("precedência de `cupom` sobre `coupon`", () => {
    expect(parseCouponParam("?coupon=EN&cupom=PT")).toBe("PT");
  });
  it("ausente → null", () => {
    expect(parseCouponParam("?from=x&to=y")).toBeNull();
    expect(parseCouponParam("")).toBeNull();
  });
});

describe("storage", () => {
  it("captureCouponFromSearch persiste o cupom da URL", () => {
    captureCouponFromSearch("?cupom=volta10");
    expect(getStoredCoupon()).toBe("VOLTA10");
  });
  it("captureCouponFromSearch é no-op sem cupom", () => {
    captureCouponFromSearch("?utm_source=ig");
    expect(getStoredCoupon()).toBeNull();
  });
  it("storeCoupon normaliza; clearStoredCoupon remove", () => {
    storeCoupon(" promo5 ");
    expect(getStoredCoupon()).toBe("PROMO5");
    clearStoredCoupon();
    expect(getStoredCoupon()).toBeNull();
  });
});
