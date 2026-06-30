import { assertEquals } from "jsr:@std/assert";
import { parseExtendInput } from "./logic.ts";

Deno.test("parseExtendInput: exige booking_code", () => {
  assertEquals(parseExtendInput({}).error, "booking_code é obrigatório.");
  assertEquals(parseExtendInput({ booking_code: "  " }).error, "booking_code é obrigatório.");
});

Deno.test("parseExtendInput: exige new_check_out_at válido", () => {
  assertEquals(parseExtendInput({ booking_code: "MP-1" }).error, "new_check_out_at é obrigatório.");
  assertEquals(
    parseExtendInput({ booking_code: "MP-1", new_check_out_at: "amanhã" }).error,
    "new_check_out_at inválido (use ISO 8601).",
  );
});

Deno.test("parseExtendInput: normaliza data pra ISO e reason", () => {
  const { input } = parseExtendInput({
    booking_code: " MP-2 ",
    new_check_out_at: "2026-12-13T08:00:00Z",
    reason: "  voo atrasou ",
  });
  assertEquals(input, {
    bookingCode: "MP-2",
    newCheckOutAt: "2026-12-13T08:00:00.000Z",
    reason: "voo atrasou",
  });
});

Deno.test("parseExtendInput: reason vazio → null", () => {
  const { input } = parseExtendInput({ booking_code: "MP-3", new_check_out_at: "2026-12-13T08:00:00Z" });
  assertEquals(input?.reason, null);
});
