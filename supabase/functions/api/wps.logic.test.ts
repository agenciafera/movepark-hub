import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseWpsEvent } from "./wps.logic.ts";

Deno.test("parseWpsEvent: entrada válida por placa", () => {
  const r = parseWpsEvent({
    event_id: "evt_1",
    type: "vehicle.entered",
    plate: "ABC-1D23",
    location_ref: "lote-01",
    occurred_at: "2026-06-29T10:00:00Z",
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.event_id, "evt_1");
    assertEquals(r.value.type, "vehicle.entered");
    assertEquals(r.value.plate, "ABC-1D23");
    assertEquals(r.value.location_ref, "lote-01");
    assertEquals(r.value.version, "1");
  }
});

Deno.test("parseWpsEvent: saída válida por booking_code (sem placa)", () => {
  const r = parseWpsEvent({ event_id: "e2", type: "vehicle.exited", booking_code: "MP-ABCD" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.booking_code, "MP-ABCD");
});

Deno.test("parseWpsEvent: tipo inválido", () => {
  const r = parseWpsEvent({ event_id: "e", type: "foo", plate: "ABC1234" });
  assertEquals(r.ok, false);
});

Deno.test("parseWpsEvent: sem event_id", () => {
  const r = parseWpsEvent({ type: "vehicle.entered", plate: "ABC1234" });
  assertEquals(r.ok, false);
});

Deno.test("parseWpsEvent: sem placa e sem booking_code", () => {
  const r = parseWpsEvent({ event_id: "e", type: "vehicle.entered" });
  assertEquals(r.ok, false);
});
