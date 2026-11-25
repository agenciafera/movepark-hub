import { assertEquals } from "jsr:@std/assert";
import { lerPedido } from "./logic.ts";

Deno.test("lerPedido: campanha e limite", () => {
  assertEquals(lerPedido({ campaignId: "c-1", limit: 50 }), { ok: true, campaignId: "c-1", limit: 50 });
});

Deno.test("lerPedido: sem limite usa 100", () => {
  assertEquals(lerPedido({ campaignId: "c-1" }), { ok: true, campaignId: "c-1", limit: 100 });
});

Deno.test("lerPedido: limite que não é número é ignorado", () => {
  assertEquals(lerPedido({ campaignId: "c-1", limit: "999" }), { ok: true, campaignId: "c-1", limit: 100 });
});

Deno.test("lerPedido: sem campanha recusa", () => {
  assertEquals(lerPedido({}), { ok: false, erro: "campaignId obrigatório" });
  assertEquals(lerPedido({ campaignId: "  " }), { ok: false, erro: "campaignId obrigatório" });
});

Deno.test("lerPedido: corpo que não é objeto recusa", () => {
  assertEquals(lerPedido(null), { ok: false, erro: "campaignId obrigatório" });
  assertEquals(lerPedido("c-1"), { ok: false, erro: "campaignId obrigatório" });
});
