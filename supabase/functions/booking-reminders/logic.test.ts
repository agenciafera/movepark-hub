import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingFor, reminderWindows } from "./logic.ts";

Deno.test("reminderWindows: 24h para a entrada, 2h para a retirada", () => {
  const w = reminderWindows(Date.parse("2026-12-10T10:00:00Z"));
  assertEquals(w.checkinUntil, "2026-12-11T10:00:00.000Z");
  assertEquals(w.checkoutUntil, "2026-12-10T12:00:00.000Z");
});

Deno.test("pendingFor: quem já recebeu sai do lote", () => {
  assertEquals(pendingFor([{ id: "a" }, { id: "b" }], new Set(["a"])), [{ id: "b" }]);
});
