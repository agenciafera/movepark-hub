import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contextRefusal, legacyRefusalMessage, parseInput } from "./logic.ts";

const ID = "8b0f2c3a-1d2e-4f5a-9b6c-7d8e9f0a1b2c";

Deno.test("parseInput: comparecimento só com os três valores do site", () => {
  assertEquals(parseInput({ action: "attendance", wl_booking_id: ID, status: "compareceu" }).ok, true);
  assertEquals(parseInput({ action: "attendance", wl_booking_id: ID, status: "talvez" }), {
    ok: false,
    error: "Situação de comparecimento inválida.",
  });
  assertEquals(parseInput({ action: "attendance", wl_booking_id: "x", status: "no_show" }).ok, false);
});

Deno.test("parseInput: troca de placa exige placa válida e motivo", () => {
  assertEquals(parseInput({ action: "license_plate", wl_booking_id: ID, license_plate: "ABC", reason: "x" }), {
    ok: false,
    error: "Placa inválida.",
  });
  assertEquals(parseInput({ action: "license_plate", wl_booking_id: ID, license_plate: "ABC1D23", reason: "  " }), {
    ok: false,
    error: "Conte o motivo da troca.",
  });
  const ok = parseInput({ action: "license_plate", wl_booking_id: ID, license_plate: "abc-1d23", reason: "carro da esposa", brand: " " });
  assertEquals(ok.ok, true);
  if (ok.ok && ok.input.action === "license_plate") assertEquals(ok.input.brand, null);
});

Deno.test("parseInput: ação fora da lista (cancelar) é recusada", () => {
  assertEquals(parseInput({ action: "cancel", wl_booking_id: ID }).ok, false);
});

Deno.test("contextRefusal e legacyRefusalMessage falam a língua de quem clicou", () => {
  assertEquals(contextRefusal("forbidden").status, 403);
  assertEquals(contextRefusal("disabled").status, 409);
  assertEquals(legacyRefusalMessage("before_checkin"), "Só dá para marcar que o cliente chegou depois do horário de entrada.");
  assertEquals(legacyRefusalMessage("qualquer"), "O site recusou a ação.");
});
