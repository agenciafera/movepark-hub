import { assertEquals } from "jsr:@std/assert";
import { parseBrPhone, parseChangeDatesPaidInput } from "./logic.ts";

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

Deno.test("parseBrPhone: normaliza com/sem DDI e rejeita curto", () => {
  assertEquals(parseBrPhone("+55 11 98772-7182"), { ddd: "11", number: "987727182" });
  assertEquals(parseBrPhone("11987727182"), { ddd: "11", number: "987727182" });
  assertEquals(parseBrPhone("123"), null);
  assertEquals(parseBrPhone(null), null);
});
