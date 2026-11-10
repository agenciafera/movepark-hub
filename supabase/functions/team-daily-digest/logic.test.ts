import { assertEquals } from "jsr:@std/assert";
import { parseTeamDigestBody, parseTeamRecipients, teamDigestDay } from "./logic.ts";

Deno.test("o dia do resumo é ontem em Brasília, também na virada UTC", () => {
  // 10/11/2026 às 10h UTC = 7h em Brasília → resumo de 09/11.
  assertEquals(teamDigestDay(Date.parse("2026-11-10T10:00:00Z")), "2026-11-09");
  // 11/11 às 01h UTC ainda é 10/11 em Brasília → resumo de 09/11.
  assertEquals(teamDigestDay(Date.parse("2026-11-11T01:00:00Z")), "2026-11-09");
  // virada de mês
  assertEquals(teamDigestDay(Date.parse("2026-12-01T10:00:00Z")), "2026-11-30");
});

Deno.test("corpo: dia válido e dry_run; o resto é ignorado", () => {
  assertEquals(parseTeamDigestBody({ day: "2026-11-09", dry_run: true }), { day: "2026-11-09", dryRun: true });
  assertEquals(parseTeamDigestBody({ day: "ontem", dry_run: "sim" }), { day: null, dryRun: false });
  assertEquals(parseTeamDigestBody(null), { day: null, dryRun: false });
});

Deno.test("destinatários: separa por vírgula, ponto-e-vírgula ou espaço, minúsculo e sem repetir", () => {
  assertEquals(parseTeamRecipients("Contato@movepark.co, a@x.com;b@x.com  a@x.com"), ["contato@movepark.co", "a@x.com", "b@x.com"]);
  assertEquals(parseTeamRecipients(""), []);
  assertEquals(parseTeamRecipients(null), []);
  assertEquals(parseTeamRecipients("sem-arroba, x@y.com"), ["x@y.com"]);
});
