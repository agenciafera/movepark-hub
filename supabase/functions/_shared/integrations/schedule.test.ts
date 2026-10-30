import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { HOLD_MINUTES, nextRetryDelaySeconds, shouldGiveUp } from "./schedule.ts";

Deno.test("nextRetryDelaySeconds: 1, 2, 4, 8 e 16 minutos, depois de hora em hora", () => {
  assertEquals([1, 2, 3, 4, 5].map(nextRetryDelaySeconds), [60, 120, 240, 480, 960]);
  assertEquals(nextRetryDelaySeconds(6), 3600);
  assertEquals(nextRetryDelaySeconds(27), 3600);
  assertEquals(nextRetryDelaySeconds(0), 60); // guarda
});

Deno.test("shouldGiveUp: desiste ao bater o máximo de tentativas (cerca de 24 horas)", () => {
  assertEquals(shouldGiveUp(27, 28), false);
  assertEquals(shouldGiveUp(28, 28), true);
  // 5 tentativas exponenciais (31 min) + 23 de hora em hora ≈ 24 h
  const total = Array.from({ length: 27 }, (_, i) => nextRetryDelaySeconds(i + 1)).reduce((a, b) => a + b, 0);
  assertEquals(Math.round(total / 3600), 23);
});

Deno.test("HOLD_MINUTES: o e-mail espera até 15 minutos (decisão D4)", () => {
  assertEquals(HOLD_MINUTES, 15);
});
