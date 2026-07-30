import { assertEquals } from "jsr:@std/assert";
// `parseBrPhone` mora em _shared/payments/contact.ts e é testada lá.
import { parseChangeDatesPaidInput } from "./logic.ts";

Deno.test("parseChangeDatesPaidInput: exige código e datas válidas", () => {
  assertEquals(parseChangeDatesPaidInput({}).error, "booking_code é obrigatório.");
  assertEquals(
    parseChangeDatesPaidInput({ booking_code: "MP-1", check_in_at: "x", check_out_at: "y" }).error,
    "Datas inválidas (use ISO 8601).",
  );
});

Deno.test("parseChangeDatesPaidInput: check_out após check_in + normaliza ISO", () => {
  assertEquals(
    parseChangeDatesPaidInput({
      booking_code: "MP-1",
      check_in_at: "2027-05-12T12:00:00Z",
      check_out_at: "2027-05-10T12:00:00Z",
    }).error,
    "Check-out precisa ser após o check-in.",
  );
  const { input } = parseChangeDatesPaidInput({
    booking_code: " MP-2 ",
    check_in_at: "2027-05-20T12:00:00Z",
    check_out_at: "2027-05-24T12:00:00Z",
  });
  assertEquals(input, {
    bookingCode: "MP-2",
    checkInAt: "2027-05-20T12:00:00.000Z",
    checkOutAt: "2027-05-24T12:00:00.000Z",
  });
});
