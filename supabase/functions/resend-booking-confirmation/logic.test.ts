import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canResendConfirmation, parseResendInput, resendOutcome } from "./logic.ts";

Deno.test("parseResendInput: aceita o código da reserva e normaliza caixa e espaços", () => {
  assertEquals(parseResendInput({ code: " mp-7k2q9x " }), { ok: true, input: { code: "MP-7K2Q9X" } });
});

Deno.test("parseResendInput: recusa código ausente ou fora do formato", () => {
  assertEquals(parseResendInput({}).ok, false);
  assertEquals(parseResendInput({ code: "7K2Q9X" }).ok, false);
  assertEquals(parseResendInput({ code: "MP-" }).ok, false);
  assertEquals(parseResendInput(null).ok, false);
});

Deno.test("canResendConfirmation: só reserva confirmada ou com check-in feito", () => {
  assertEquals(canResendConfirmation("confirmed"), true);
  assertEquals(canResendConfirmation("checked_in"), true);
  for (const s of ["pending", "completed", "cancelled", "expired", "no_show", null, undefined]) {
    assertEquals(canResendConfirmation(s), false, String(s));
  }
});

Deno.test("resendOutcome: carimbo prova o envio; sem carimbo, retido ou não enviado", () => {
  assertEquals(resendOutcome("2026-11-23T10:00:00Z", false), "sent");
  assertEquals(resendOutcome(null, true), "held");
  assertEquals(resendOutcome(null, false), "not_sent");
});
