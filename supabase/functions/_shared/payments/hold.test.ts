import { assertEquals } from "jsr:@std/assert";
import { HOLD_MINUTES_FALLBACK, pixExpiresInSeconds } from "./hold.ts";

Deno.test("converte os minutos de hold da RPC em segundos de validade do PIX", () => {
  assertEquals(pixExpiresInSeconds(30), 1800);
  assertEquals(pixExpiresInSeconds(45), 2700);
});

Deno.test("RPC indisponível cai no mesmo default da get_booking_hold_minutes", () => {
  assertEquals(pixExpiresInSeconds(null), HOLD_MINUTES_FALLBACK * 60);
  assertEquals(pixExpiresInSeconds(undefined), HOLD_MINUTES_FALLBACK * 60);
  assertEquals(HOLD_MINUTES_FALLBACK, 30);
});

Deno.test("valor não numérico não vira NaN na validade da cobrança", () => {
  assertEquals(pixExpiresInSeconds("nada"), 1800);
  assertEquals(pixExpiresInSeconds({}), 1800);
});

Deno.test("PostgREST devolvendo número em string continua valendo", () => {
  assertEquals(pixExpiresInSeconds("45"), 2700);
});

Deno.test("minuto fora da faixa é apertado igual à RPC (5 a 1440)", () => {
  assertEquals(pixExpiresInSeconds(0), 300);
  assertEquals(pixExpiresInSeconds(-10), 300);
  assertEquals(pixExpiresInSeconds(99999), 1440 * 60);
});
