// Testes da lógica de horário -> FAQ (86ajp6vnf).

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describeBusinessHours, tolerancePhrase } from "./hours.ts";

Deno.test("tolerancePhrase: horas, minutos e a combinação", () => {
  assertEquals(tolerancePhrase(0), "");
  assertEquals(tolerancePhrase(60), "1 hora");
  assertEquals(tolerancePhrase(120), "2 horas");
  assertEquals(tolerancePhrase(30), "30 minutos");
  assertEquals(tolerancePhrase(90), "1 hora e 30 minutos");
});

Deno.test("tolerância entra na resposta de retirada, em 24h e em comercial", () => {
  const vinteQuatro = describeBusinessHours(true, null, 60);
  assertStringIncludes(vinteQuatro.afterHours, "1 hora de tolerância");

  const comercial = describeBusinessHours(false, { mon: { open: "07:00", close: "20:00" } }, 60);
  assertStringIncludes(comercial.afterHours, "1 hora de tolerância");
});

Deno.test("sem tolerância, a resposta de retirada não menciona tolerância", () => {
  const { afterHours } = describeBusinessHours(true, null, 0);
  assertEquals(afterHours.includes("tolerância"), false);
});

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
