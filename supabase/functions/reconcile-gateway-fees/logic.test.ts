import { assertEquals } from "jsr:@std/assert";
import { BATCH_LIMIT, feeWindowIso } from "./logic.ts";

Deno.test("feeWindowIso: o recebível não nasce junto com o pagamento", () => {
  const agora = Date.parse("2026-09-11T12:00:00.000Z");
  // Corte superior: só cobranças pagas há pelo menos 10 minutos entram na varredura.
  assertEquals(feeWindowIso(agora).until, "2026-09-11T11:50:00.000Z");
});

Deno.test("feeWindowIso: a janela tem fundo, senão a varredura tenta para sempre", () => {
  const agora = Date.parse("2026-09-11T12:00:00.000Z");
  // 90 dias atrás: cobrança que nunca gerou recebível para de ser reconsultada.
  assertEquals(feeWindowIso(agora).since, "2026-06-13T12:00:00.000Z");
});

Deno.test("feeWindowIso: o fundo vem sempre antes do topo", () => {
  const w = feeWindowIso(Date.now());
  assertEquals(Date.parse(w.since) < Date.parse(w.until), true);
});

Deno.test("BATCH_LIMIT: lote pequeno, porque cada item é uma chamada ao gateway", () => {
  assertEquals(BATCH_LIMIT > 0 && BATCH_LIMIT <= 50, true);
});
