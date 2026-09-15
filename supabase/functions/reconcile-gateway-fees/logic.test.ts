import { assertEquals } from "jsr:@std/assert";
import { BATCH_LIMIT, feeRetryCutoffIso, feeWindowIso } from "./logic.ts";

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

// ── Recuo entre tentativas (varredura de 15/09/2026) ────────────────────────
// O filtro ignorava `gateway_fee_synced_at`: as mesmas 25 cobranças sem recebível eram reconsultadas
// a cada 30 minutos (190 execuções, uns 4.750 GET /payables inúteis), e as outras nunca entravam.

Deno.test("feeRetryCutoffIso: só reconsulta quem foi tentado há mais de 6 horas", () => {
  const agora = Date.parse("2026-09-15T12:00:00.000Z");
  assertEquals(feeRetryCutoffIso(agora), "2026-09-15T06:00:00.000Z");
});

Deno.test("feeRetryCutoffIso: o recuo é bem maior que o intervalo do cron", () => {
  // Cron de 30 min: recuo menor que isso não muda nada, a mesma cobrança volta toda passada.
  const agora = Date.now();
  const recuoMin = (agora - Date.parse(feeRetryCutoffIso(agora))) / 60_000;
  assertEquals(recuoMin >= 6 * 30, true);
});

Deno.test("feeRetryCutoffIso: o recuo cabe dentro da janela de 90 dias", () => {
  const agora = Date.now();
  assertEquals(Date.parse(feeRetryCutoffIso(agora)) > Date.parse(feeWindowIso(agora).since), true);
});
