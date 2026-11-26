import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliveryChange, parseStoredCode } from "./change.ts";

Deno.test("deliveryChange: lê a janela e a placa que a cancela tinha antes da troca", () => {
  assertEquals(
    deliveryChange({
      reason: "change",
      previous: { check_in_at: "2027-03-10T12:00:00+00:00", check_out_at: "2027-03-15T12:00:00+00:00", plate: "AAA1A11" },
    }),
    { previousCheckInAt: "2027-03-10T12:00:00+00:00", previousCheckOutAt: "2027-03-15T12:00:00+00:00", previousPlate: "AAA1A11" },
  );
  assertEquals(deliveryChange({ reason: "change", previous: { plate: null } }), {
    previousCheckInAt: null,
    previousCheckOutAt: null,
    previousPlate: null,
  });
});

Deno.test("deliveryChange: a entrega da confirmação não é troca", () => {
  assertEquals(deliveryChange(null), null);
  assertEquals(deliveryChange({}), null);
  assertEquals(deliveryChange({ reason: "reserve" }), null);
  assertEquals(deliveryChange("change"), null);
});

Deno.test("parseStoredCode: código novo e o aposentado", () => {
  assertEquals(parseStoredCode({ stored: true, code_id: "x", previous_code: "CODE-A" }), { stored: true, previousCode: "CODE-A" });
  assertEquals(parseStoredCode({ stored: false, previous_code: null }), { stored: false, previousCode: null });
  assertEquals(parseStoredCode(null), { stored: false, previousCode: null });
});
