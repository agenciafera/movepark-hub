import { assertEquals } from "jsr:@std/assert";
import { MARKETING_TOOLS } from "./tools.ts";
import { MARKETING_HANDLED } from "./handlers.ts";

const ESCOPOS = ["marketing:read", "marketing:write", "marketing:dispatch"];

Deno.test("toda tool de marketing tem prefixo, escopo de marketing e schema fechado", () => {
  for (const t of MARKETING_TOOLS) {
    assertEquals(t.name.startsWith("marketing_"), true, t.name);
    assertEquals(ESCOPOS.includes(t.scope), true, t.name);
    assertEquals(t.inputSchema.type, "object", t.name);
    assertEquals(t.inputSchema.additionalProperties, false, t.name);
  }
});

Deno.test("nomes únicos", () => {
  const nomes = MARKETING_TOOLS.map((t) => t.name);
  assertEquals(new Set(nomes).size, nomes.length);
});

Deno.test("só run_campaign e set_dispatch_enabled exigem o escopo de disparo", () => {
  const disparo = MARKETING_TOOLS.filter((t) => t.scope === "marketing:dispatch").map((t) => t.name).sort();
  assertEquals(disparo, ["marketing_run_campaign", "marketing_set_dispatch_enabled"]);
});

Deno.test("toda tool declarada tem handler, e todo handler tem tool", () => {
  assertEquals(
    [...MARKETING_HANDLED].sort(),
    MARKETING_TOOLS.map((t) => t.name).sort(),
  );
});
