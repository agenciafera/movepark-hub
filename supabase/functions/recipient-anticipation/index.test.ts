import { assertEquals } from "jsr:@std/assert";
import { feeBorneBy, parseAnticipationInput } from "./logic.ts";

Deno.test("ações válidas", () => {
  assertEquals(parseAnticipationInput({ action: "limits", company_id: "c1" }).input?.action, "limits");
  assertEquals(parseAnticipationInput({ action: "settings", recipient: "master" }).input?.recipient, "master");
  assertEquals(parseAnticipationInput({ action: "settings", company_id: "c1" }).input?.companyId, "c1");
  assertEquals(parseAnticipationInput({ action: "sync" }).input?.action, "sync");
});

Deno.test("simular e criar exigem valor inteiro positivo e timeframe start/end", () => {
  assertEquals(
    parseAnticipationInput({ action: "simulate", company_id: "c1", requested_cents: 0, timeframe: "start" }).input,
    null,
  );
  assertEquals(
    parseAnticipationInput({ action: "create", company_id: "c1", requested_cents: 1000, timeframe: "meio" }).input,
    null,
  );
  assertEquals(
    parseAnticipationInput({ action: "create", company_id: "c1", requested_cents: 10.5, timeframe: "start" }).input,
    null,
  );
  assertEquals(
    parseAnticipationInput({ action: "create", company_id: "c1", requested_cents: 1000, timeframe: "end" }).input
      ?.requestedCents,
    1000,
  );
  assertEquals(
    parseAnticipationInput({ action: "simulate", company_id: "c1", requested_cents: 1000 }).input?.timeframe,
    "start",
  );
});

Deno.test("limites, simulação e criação exigem a empresa", () => {
  assertEquals(parseAnticipationInput({ action: "limits" }).input, null);
  assertEquals(parseAnticipationInput({ action: "create", requested_cents: 1000 }).input, null);
  assertEquals(parseAnticipationInput({ action: "settings" }).input, null);
});

Deno.test("ação desconhecida e corpo vazio são recusados", () => {
  assertEquals(parseAnticipationInput({ action: "apagar" }).input, null);
  assertEquals(parseAnticipationInput(null).input, null);
  assertEquals(parseAnticipationInput("x").input, null);
});

Deno.test("pagador da pontual: empresa, senão padrão, senão Movepark", () => {
  assertEquals(feeBorneBy("partner", "movepark"), "partner");
  assertEquals(feeBorneBy(null, "partner"), "partner");
  assertEquals(feeBorneBy(null, null), "movepark");
  assertEquals(feeBorneBy(null, "qualquer"), "movepark");
});
