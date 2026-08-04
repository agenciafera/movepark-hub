import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { avaliarGuardaAmbiente } from "./logic.ts";

/**
 * O teste que importa deste arquivo é o primeiro: sem a variável, a função recusa.
 * Ela confirma reserva sem cobrar, então ligada em produção é estacionamento grátis
 * para qualquer pessoa com conta.
 */

Deno.test("sem a variável, a rota recusa", () => {
  const d = avaliarGuardaAmbiente(undefined);
  assertEquals(d.permitido, false);
});

Deno.test("responde 404, não 403: quem sonda não descobre que a rota existe", () => {
  const d = avaliarGuardaAmbiente(undefined);
  if (d.permitido) throw new Error("deveria ter recusado");
  assertEquals(d.status, 404);
  assertEquals(d.erro, "Not found");
});

Deno.test("só a string exata 'true' liga", () => {
  assertEquals(avaliarGuardaAmbiente("true").permitido, true);
});

Deno.test("valores parecidos com sim continuam desligados", () => {
  // O jeito clássico de a guarda vazar é aceitar qualquer coisa truthy: um painel
  // que grave "1" ou "TRUE" religaria a rota sem ninguém perceber.
  for (const v of ["1", "yes", "TRUE", "True", " true", "true ", "on", ""]) {
    assertEquals(avaliarGuardaAmbiente(v).permitido, false, `"${v}" não pode ligar`);
  }
});
