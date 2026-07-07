import { describe, expect, it } from "vitest";
import {
  clampGraceMinutes,
  clampHoldMinutes,
  DEFAULT_BOOKING_HOLD_GRACE_MINUTES,
  DEFAULT_BOOKING_HOLD_MINUTES,
  parseGraceMinutes,
  parseHoldMinutes,
} from "./bookingHold";

describe("clampHoldMinutes", () => {
  it("mantém valores dentro da faixa", () => {
    expect(clampHoldMinutes(30)).toBe(30);
    expect(clampHoldMinutes(45)).toBe(45);
    expect(clampHoldMinutes("45")).toBe(45);
  });

  it("clampa abaixo do mínimo (5) e acima do máximo (1440)", () => {
    expect(clampHoldMinutes(1)).toBe(5);
    expect(clampHoldMinutes(0)).toBe(5);
    expect(clampHoldMinutes(99999)).toBe(1440);
  });

  it("arredonda e cai no default quando não é número (NaN)", () => {
    expect(clampHoldMinutes(30.7)).toBe(31);
    expect(clampHoldMinutes("abc")).toBe(DEFAULT_BOOKING_HOLD_MINUTES);
    expect(clampHoldMinutes(undefined)).toBe(DEFAULT_BOOKING_HOLD_MINUTES);
  });
});

describe("clampGraceMinutes", () => {
  it("mantém e clampa a faixa 0..60", () => {
    expect(clampGraceMinutes(2)).toBe(2);
    expect(clampGraceMinutes(-5)).toBe(0);
    expect(clampGraceMinutes(120)).toBe(60);
    expect(clampGraceMinutes("xyz")).toBe(DEFAULT_BOOKING_HOLD_GRACE_MINUTES);
  });
});

describe("parseHoldMinutes / parseGraceMinutes", () => {
  it("vazio ou ausente vira default", () => {
    expect(parseHoldMinutes(undefined)).toBe(DEFAULT_BOOKING_HOLD_MINUTES);
    expect(parseHoldMinutes(null)).toBe(DEFAULT_BOOKING_HOLD_MINUTES);
    expect(parseHoldMinutes("")).toBe(DEFAULT_BOOKING_HOLD_MINUTES);
    expect(parseHoldMinutes("  ")).toBe(DEFAULT_BOOKING_HOLD_MINUTES);
    expect(parseGraceMinutes(undefined)).toBe(DEFAULT_BOOKING_HOLD_GRACE_MINUTES);
  });

  it("lê o valor cru do app_setting e clampa", () => {
    expect(parseHoldMinutes("45")).toBe(45);
    expect(parseHoldMinutes("1")).toBe(5);
    expect(parseGraceMinutes("3")).toBe(3);
    expect(parseGraceMinutes("999")).toBe(60);
  });
});
