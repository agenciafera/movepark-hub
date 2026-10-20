import { assertEquals } from "jsr:@std/assert";
import { digestCounts, digestDay, parseDigestBody, pickRecipients } from "./logic.ts";

Deno.test("digestDay: às 6h de Brasília (09h UTC) o dia é o de Brasília", () => {
  assertEquals(digestDay(Date.parse("2026-10-20T09:00:00Z")), "2026-10-20");
  // 01h UTC ainda é o dia anterior em Brasília
  assertEquals(digestDay(Date.parse("2026-10-21T01:00:00Z")), "2026-10-20");
});

Deno.test("parseDigestBody: só aceita dia no formato certo", () => {
  assertEquals(parseDigestBody({}), { day: null, companyId: null, dryRun: false });
  assertEquals(parseDigestBody({ day: "2026-10-20", company_id: " c1 ", dry_run: true }), { day: "2026-10-20", companyId: "c1", dryRun: true });
  assertEquals(parseDigestBody({ day: "20/10/2026" }).day, null);
});

Deno.test("pickRecipients: equipe sem repetição; sem equipe, o contato da empresa", () => {
  assertEquals(pickRecipients(["Dono@ex.com", "dono@ex.com", "op@ex.com"], "kyc@ex.com"), ["dono@ex.com", "op@ex.com"]);
  assertEquals(pickRecipients([], " Contato@Ex.com "), ["contato@ex.com"]);
  assertEquals(pickRecipients(null, null), []);
});

Deno.test("digestCounts: soma as três listas", () => {
  assertEquals(digestCounts({ company_id: "c", company_name: "X", entradas: [1, 2], saidas: [], novas: [3] }), {
    entradas: 2, saidas: 0, novas: 1, total: 3,
  });
  assertEquals(digestCounts({ company_id: "c", company_name: "X", entradas: null, saidas: null, novas: null }).total, 0);
});
