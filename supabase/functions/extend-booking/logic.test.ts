import { assertEquals } from "jsr:@std/assert";
import { overageSentence, parseExtendInput, pickExtendedEvent } from "./logic.ts";

Deno.test("parseExtendInput: exige booking_code", () => {
  assertEquals(parseExtendInput({}).error, "booking_code é obrigatório.");
  assertEquals(parseExtendInput({ booking_code: "  " }).error, "booking_code é obrigatório.");
});

Deno.test("parseExtendInput: exige new_check_out_at válido", () => {
  assertEquals(parseExtendInput({ booking_code: "MP-1" }).error, "new_check_out_at é obrigatório.");
  assertEquals(
    parseExtendInput({ booking_code: "MP-1", new_check_out_at: "amanhã", flight_number: "LA3456" }).error,
    "new_check_out_at inválido (use ISO 8601).",
  );
});

Deno.test("parseExtendInput: normaliza data pra ISO e reason", () => {
  const { input } = parseExtendInput({
    booking_code: " MP-2 ",
    new_check_out_at: "2026-12-13T08:00:00Z",
    reason: "  voo atrasou ",
    flight_number: "la3456",
  });
  assertEquals(input, {
    bookingCode: "MP-2",
    newCheckOutAt: "2026-12-13T08:00:00.000Z",
    reason: "voo atrasou",
    flightNumber: "LA3456",
    kind: "delay",
  });
});

Deno.test("parseExtendInput: reason vazio → null", () => {
  const { input } = parseExtendInput({ booking_code: "MP-3", new_check_out_at: "2026-12-13T08:00:00Z", flight_number: "LA3456" });
  assertEquals(input?.reason, null);
});

Deno.test("parseExtendInput: exige o número do voo (Q-026) e normaliza", () => {
  assertEquals(parseExtendInput({ booking_code: "MP-1", new_check_out_at: "2026-12-13T08:00:00Z" }).error, "Informe o número do voo (ex.: LA3456).");
  assertEquals(parseExtendInput({ booking_code: "MP-1", new_check_out_at: "2026-12-13T08:00:00Z", flight_number: " la3456 " }).input?.flightNumber, "LA3456");
});

Deno.test("parseExtendInput: motivo cancelamento entra, motivo inventado cai em delay", () => {
  assertEquals(parseExtendInput({ booking_code: "MP-1", new_check_out_at: "2026-12-13T08:00:00Z", flight_number: "LA3456", kind: "cancellation" }).input?.kind, "cancellation");
  assertEquals(parseExtendInput({ booking_code: "MP-1", new_check_out_at: "2026-12-13T08:00:00Z", flight_number: "LA3456", kind: "greve" }).input?.kind, "delay");
  assertEquals(parseExtendInput({ booking_code: "MP-1", new_check_out_at: "2026-12-13T08:00:00Z", flight_number: "LA3456" }).input?.kind, "delay");
});

Deno.test("pickExtendedEvent: com excedente o aviso muda de template", () => {
  assertEquals(pickExtendedEvent(0), "extended");
  assertEquals(pickExtendedEvent(2700), "extended_overage");
});

Deno.test("overageSentence: diz até quando é por nossa conta e o preço por dia no balcão", () => {
  const s = overageSentence("2026-12-14T08:00:00Z", 2700);
  assertEquals(s.includes("R$ 27,00 por dia") && s.includes("pago no estacionamento"), true);
});
