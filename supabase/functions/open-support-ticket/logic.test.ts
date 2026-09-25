import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { confirmationText, firstNameOf, parseTicketInput } from "./logic.ts";

Deno.test("parseTicketInput: normaliza código, aceita motivo e limpa espaços", () => {
  const r = parseTicketInput({ booking_code: " mp-8c497e ", kind: "complaint", message: "  O portão   estava fechado quando cheguei.  " });
  assertEquals(r, { ok: true, input: { booking_code: "MP-8C497E", kind: "complaint", message: "O portão estava fechado quando cheguei." } });
});

Deno.test("parseTicketInput: recusa reserva torta, motivo fora da lista e mensagem curta", () => {
  assertEquals(parseTicketInput({ booking_code: "123", kind: "complaint", message: "mensagem valida aqui" }).ok, false);
  assertEquals(parseTicketInput({ booking_code: "MP-8C497E", kind: "elogio", message: "mensagem valida aqui" }).ok, false);
  assertEquals(parseTicketInput({ booking_code: "MP-8C497E", kind: "question", message: "curta" }).ok, false);
  assertEquals(parseTicketInput({ booking_code: "MP-8C497E", kind: "other", message: "x".repeat(2001) }).ok, false);
});

Deno.test("confirmationText: cita reserva, chamado e o horário comercial", () => {
  const t = confirmationText("Ana", "MP-1A2B3C", "CH-K7M2PX");
  assertEquals(t.includes("MP-1A2B3C") && t.includes("CH-K7M2PX") && t.includes("segunda a sexta, das 9h às 18h"), true);
});

Deno.test("firstNameOf: primeiro nome ou cliente", () => {
  assertEquals(firstNameOf("Ana Paula Souza"), "Ana");
  assertEquals(firstNameOf("   "), "cliente");
  assertEquals(firstNameOf(null), "cliente");
});
