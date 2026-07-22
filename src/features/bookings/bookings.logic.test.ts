import { describe, expect, it } from "vitest";
import { bucketBooking, bookingCustomerName, type BucketableBooking } from "./bookings.logic";

const NOW = new Date("2026-06-13T12:00:00Z");

function booking(over: Partial<BucketableBooking>): BucketableBooking {
  return {
    status: "confirmed",
    check_in_at: "2026-06-20T10:00:00Z",
    check_out_at: "2026-06-22T10:00:00Z",
    expires_at: null,
    ...over,
  };
}

describe("bucketBooking", () => {
  it("checked_in → active", () => {
    expect(bucketBooking(booking({ status: "checked_in" }), NOW)).toBe("active");
  });

  it("completed → history", () => {
    expect(bucketBooking(booking({ status: "completed" }), NOW)).toBe("history");
  });

  it("cancelled e no_show → cancelled", () => {
    expect(bucketBooking(booking({ status: "cancelled" }), NOW)).toBe("cancelled");
    expect(bucketBooking(booking({ status: "no_show" }), NOW)).toBe("cancelled");
  });

  it("pending não expirado → upcoming", () => {
    expect(
      bucketBooking(booking({ status: "pending", expires_at: "2026-06-13T12:10:00Z" }), NOW),
    ).toBe("upcoming");
  });

  it("pending com expires_at no passado → cancelled", () => {
    expect(
      bucketBooking(booking({ status: "pending", expires_at: "2026-06-13T11:50:00Z" }), NOW),
    ).toBe("cancelled");
  });

  it("pending sem expires_at → upcoming", () => {
    expect(bucketBooking(booking({ status: "pending", expires_at: null }), NOW)).toBe("upcoming");
  });

  it("confirmed com checkout no passado → history", () => {
    expect(
      bucketBooking(booking({ status: "confirmed", check_out_at: "2026-06-10T10:00:00Z" }), NOW),
    ).toBe("history");
  });

  it("confirmed futuro → upcoming", () => {
    expect(bucketBooking(booking({ status: "confirmed" }), NOW)).toBe("upcoming");
  });
});

describe("bookingCustomerName", () => {
  it("prefere o snapshot customer_name ao profile.full_name", () => {
    expect(
      bookingCustomerName({ customer_name: "Test Pentest", profile: { full_name: null } }),
    ).toBe("Test Pentest");
  });

  it("compõe do first/last quando não há customer_name", () => {
    expect(
      bookingCustomerName({ customer_name: null, customer_first_name: "Ana", customer_last_name: "Lima" }),
    ).toBe("Ana Lima");
  });

  it("cai para full_name só quando o snapshot está vazio (reserva legada)", () => {
    expect(bookingCustomerName({ customer_name: null, profile: { full_name: "Pedro" } })).toBe("Pedro");
  });

  it("devolve null quando não há nenhum nome", () => {
    expect(bookingCustomerName({ customer_name: null, profile: { full_name: null } })).toBeNull();
    expect(bookingCustomerName({ customer_name: "   " })).toBeNull();
  });
});
