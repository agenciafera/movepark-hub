import { assertEquals } from "jsr:@std/assert";
// `parseBrPhone` mora em _shared/payments/contact.ts e é testada lá.
import { parseChangeDatesPaidInput, quoteChanged, refundableCents } from "./logic.ts";

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
    dryRun: false,
    expectedDeltaCents: null,
  });
});

Deno.test("prévia e conferência do valor: dry_run e expected_delta_cents", () => {
  const base = { booking_code: "MP-3", check_in_at: "2027-05-20T12:00:00Z", check_out_at: "2027-05-24T12:00:00Z" };
  assertEquals(parseChangeDatesPaidInput({ ...base, dry_run: true }).input?.dryRun, true);
  assertEquals(parseChangeDatesPaidInput({ ...base, expected_delta_cents: -5780 }).input?.expectedDeltaCents, -5780);
  assertEquals(parseChangeDatesPaidInput({ ...base, expected_delta_cents: 57.8 }).error, "expected_delta_cents precisa ser inteiro (centavos).");
  // Valor mudou entre a prévia e o clique: recusa. Sem prévia (chamada antiga), não confere.
  assertEquals(quoteChanged(-5780, -5780), false);
  assertEquals(quoteChanged(-5780, 2570), true);
  assertEquals(quoteChanged(null, 8000), false);
});

Deno.test("quanto ainda dá para devolver de uma cobrança", () => {
  assertEquals(refundableCents(157.4, null), 15740);
  assertEquals(refundableCents("157.40", "57.80"), 9960);
  assertEquals(refundableCents(100, 120), 0);
});
