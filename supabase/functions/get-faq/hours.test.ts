// Testes da lógica de horário -> FAQ (86ajp6vnf).

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describeBusinessHours } from "./hours.ts";

Deno.test("24h: horário e retirada a qualquer hora", () => {
  const { hours, afterHours } = describeBusinessHours(true, null);
  assertEquals(hours, "Funciona 24 horas por dia, todos os dias.");
  assertStringIncludes(afterHours, "qualquer hora");
});

Deno.test("comercial: lista os 7 dias, fechado onde não há horário (caso Move Parking)", () => {
  const { hours, afterHours } = describeBusinessHours(false, {
    mon: { open: "07:00", close: "20:00" },
    tue: { open: "07:00", close: "20:00" },
    wed: { open: "07:00", close: "20:00" },
    thu: { open: "07:00", close: "20:00" },
    fri: { open: "07:00", close: "20:00" },
    sat: { open: "08:00", close: "17:00" },
    sun: null,
  });
  assertStringIncludes(hours, "Segunda: 07:00 às 20:00");
  assertStringIncludes(hours, "Sábado: 08:00 às 17:00");
  assertStringIncludes(hours, "Domingo: fechado");
  assertEquals(hours.split("\n").length, 7);
  assertStringIncludes(afterHours, "dentro do horário");
});

Deno.test("comercial sem dado nenhum: todos os dias fechados, não quebra", () => {
  const { hours } = describeBusinessHours(false, null);
  assertEquals(hours.split("\n").length, 7);
  assertStringIncludes(hours, "Segunda: fechado");
});
