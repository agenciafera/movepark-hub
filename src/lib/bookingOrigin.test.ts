import { describe, expect, it } from "vitest";
import { BOOKING_ORIGIN, isHubOrigin, originFromSrc } from "./bookingOrigin";

describe("originFromSrc", () => {
  it("mapeia a fonte de entrada", () => {
    expect(originFromSrc("search")).toBe(BOOKING_ORIGIN.HUB_SEARCH);
    expect(originFromSrc("destino")).toBe(BOOKING_ORIGIN.HUB_DESTINO);
  });
  it("ausente/desconhecido → entrada direta", () => {
    expect(originFromSrc(null)).toBe(BOOKING_ORIGIN.HUB_DIRECT);
    expect(originFromSrc(undefined)).toBe(BOOKING_ORIGIN.HUB_DIRECT);
    expect(originFromSrc("qualquer")).toBe(BOOKING_ORIGIN.HUB_DIRECT);
  });
});

describe("isHubOrigin", () => {
  it("hub_* é do hub; resto não", () => {
    expect(isHubOrigin(BOOKING_ORIGIN.HUB_SEARCH)).toBe(true);
    expect(isHubOrigin(BOOKING_ORIGIN.HUB_DIRECT)).toBe(true);
    expect(isHubOrigin(BOOKING_ORIGIN.WHITE_LABEL)).toBe(false);
    expect(isHubOrigin(BOOKING_ORIGIN.API)).toBe(false);
    expect(isHubOrigin(null)).toBe(false);
    expect(isHubOrigin("listing")).toBe(false);
  });
});
