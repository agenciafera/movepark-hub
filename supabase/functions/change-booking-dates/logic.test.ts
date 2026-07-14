import { assertEquals } from "jsr:@std/assert";
import { dateChangeAllowed, parseChangeDatesInput } from "./logic.ts";

// Gate por tier (espelha o seed `fare`): Básica não tem date_change; Flex/Superflex têm; staff override.
const BENEFITS = {
  basica: { date_change: false, plate_change: false },
  flex: { date_change: true, plate_change: true },
  superflex: { date_change: true, plate_change: true },
};

Deno.test("dateChangeAllowed: Básica bloqueia; Flex/Superflex liberam (cliente)", () => {
  assertEquals(dateChangeAllowed(BENEFITS.basica, false), false);
  assertEquals(dateChangeAllowed(BENEFITS.flex, false), true);
  assertEquals(dateChangeAllowed(BENEFITS.superflex, false), true);
});

Deno.test("dateChangeAllowed: staff faz override mesmo na Básica", () => {
  assertEquals(dateChangeAllowed(BENEFITS.basica, true), true);
});

Deno.test("dateChangeAllowed: benefits ausente/nulo → bloqueia cliente", () => {
  assertEquals(dateChangeAllowed(null, false), false);
  assertEquals(dateChangeAllowed({}, false), false);
});

Deno.test("parseChangeDatesInput: exige código e datas válidas", () => {
  assertEquals(parseChangeDatesInput({}).error, "booking_code é obrigatório.");
  assertEquals(parseChangeDatesInput({ booking_code: "MP-1", check_in_at: "x", check_out_at: "y" }).error, "Datas inválidas (use ISO 8601).");
});

Deno.test("parseChangeDatesInput: check_out tem que ser após check_in", () => {
  assertEquals(
    parseChangeDatesInput({ booking_code: "MP-1", check_in_at: "2027-05-12T12:00:00Z", check_out_at: "2027-05-10T12:00:00Z" }).error,
    "Check-out precisa ser após o check-in.",
  );
});

Deno.test("parseChangeDatesInput: normaliza pra ISO", () => {
  const { input } = parseChangeDatesInput({
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
