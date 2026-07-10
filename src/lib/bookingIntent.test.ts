import { afterEach, describe, expect, it } from "vitest";
import {
  clearBookingIntent,
  getBookingIntent,
  isAutoSubmitReady,
  storeBookingIntent,
  type BookingIntent,
} from "./bookingIntent";

const INTENT: BookingIntent = {
  listingId: "lpt-1",
  returnTo: "/p/virapark/gru/covered",
  from: "2026-07-12T08:00:00.000Z",
  to: "2026-07-15T20:00:00.000Z",
  passengers: 2,
  hasPcd: false,
  fare: "flex",
  addOnIds: ["a1", "a2"],
  coupon: "PROMO10",
};

afterEach(() => {
  clearBookingIntent();
});

describe("bookingIntent store", () => {
  it("faz round-trip completo pelo sessionStorage", () => {
    storeBookingIntent(INTENT);
    expect(getBookingIntent()).toEqual(INTENT);
  });

  it("retorna null quando não há intenção", () => {
    expect(getBookingIntent()).toBeNull();
  });

  it("clear remove a intenção", () => {
    storeBookingIntent(INTENT);
    clearBookingIntent();
    expect(getBookingIntent()).toBeNull();
  });

  it("retorna null com JSON corrompido em vez de lançar", () => {
    sessionStorage.setItem("mp_booking_intent", "{not valid json");
    expect(getBookingIntent()).toBeNull();
  });

  it("retorna null se faltar campo essencial (listingId)", () => {
    sessionStorage.setItem(
      "mp_booking_intent",
      JSON.stringify({ from: INTENT.from, to: INTENT.to, fare: "flex" }),
    );
    expect(getBookingIntent()).toBeNull();
  });

  it("preenche defaults seguros para campos opcionais ausentes", () => {
    sessionStorage.setItem(
      "mp_booking_intent",
      JSON.stringify({ listingId: "lpt-1", from: INTENT.from, to: INTENT.to, fare: "basic" }),
    );
    expect(getBookingIntent()).toEqual({
      listingId: "lpt-1",
      returnTo: "",
      from: INTENT.from,
      to: INTENT.to,
      passengers: 1,
      hasPcd: false,
      fare: "basic",
      addOnIds: [],
      coupon: null,
    });
  });
});

describe("isAutoSubmitReady", () => {
  const ready = {
    pending: true,
    hasSession: true,
    role: "customer",
    authLoading: false,
    canReserve: true,
    couponReady: true,
  };

  it("libera quando tudo está pronto", () => {
    expect(isAutoSubmitReady(ready)).toBe(true);
  });

  it("bloqueia sem intenção pendente", () => {
    expect(isAutoSubmitReady({ ...ready, pending: false })).toBe(false);
  });

  it("bloqueia enquanto a sessão ainda carrega (evita corrida)", () => {
    expect(isAutoSubmitReady({ ...ready, authLoading: true })).toBe(false);
  });

  it("bloqueia se o papel não for cliente", () => {
    expect(isAutoSubmitReady({ ...ready, role: "hub_admin" })).toBe(false);
  });

  it("bloqueia se o lote não está reservável (revalidação de disponibilidade/preço)", () => {
    expect(isAutoSubmitReady({ ...ready, canReserve: false })).toBe(false);
  });

  it("bloqueia enquanto o cupom não resolveu (não submete sem o desconto)", () => {
    expect(isAutoSubmitReady({ ...ready, couponReady: false })).toBe(false);
  });
});
