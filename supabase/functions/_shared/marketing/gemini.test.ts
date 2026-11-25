import { assertEquals } from "jsr:@std/assert";
import { camposJson, marketingGeminiDecls, prepararArgs, toGeminiSchema } from "./gemini.ts";
import { MARKETING_TOOLS } from "./tools.ts";

const semChave = (o: unknown, chave: string): boolean =>
  JSON.stringify(o).includes(`"${chave}"`) === false;

Deno.test("toGeminiSchema tira additionalProperties e format em todo nível", () => {
  const s = toGeminiSchema({
    type: "object",
    additionalProperties: false,
    required: ["a"],
    properties: {
      a: { type: "string", format: "date-time" },
      b: { type: "array", items: { type: "string" } },
    },
  });
  assertEquals(semChave(s, "additionalProperties"), true);
  assertEquals(semChave(s, "format"), true);
  assertEquals((s.properties as Record<string, unknown>).b, { type: "array", items: { type: "string" } });
});

Deno.test("objeto livre vira texto JSON", () => {
  const s = toGeminiSchema({
    type: "object",
    properties: { definition: { type: "object", description: "Árvore do segmento." } },
  });
  const def = (s.properties as Record<string, { type: string; description: string }>).definition;
  assertEquals(def.type, "string");
  assertEquals(def.description.includes("texto JSON"), true);
});

Deno.test("todas as tools viram declaração sem chave que o Gemini recusa", () => {
  const decls = marketingGeminiDecls();
  assertEquals(decls.length, MARKETING_TOOLS.length);
  assertEquals(semChave(decls, "additionalProperties"), true);
  assertEquals(semChave(decls, "format"), true);
});

Deno.test("camposJson acha definition e canvas", () => {
  const save = MARKETING_TOOLS.find((t) => t.name === "marketing_save_campaign")!;
  assertEquals(camposJson(save), ["canvas"]);
  const prev = MARKETING_TOOLS.find((t) => t.name === "marketing_preview_segment")!;
  assertEquals(camposJson(prev), ["definition"]);
});

Deno.test("prepararArgs converte o texto JSON de volta", () => {
  const r = prepararArgs("marketing_preview_segment", {
    definition: '{"match":"all","rules":[]}',
    limit: 5,
  });
  assertEquals(r, { ok: true, args: { definition: { match: "all", rules: [] }, limit: 5 } });
});

Deno.test("prepararArgs aceita objeto que já veio como objeto", () => {
  const r = prepararArgs("marketing_preview_segment", { definition: { match: "all", rules: [] } });
  assertEquals(r.ok, true);
});

Deno.test("prepararArgs devolve erro legível para JSON quebrado", () => {
  const r = prepararArgs("marketing_save_campaign", { name: "x", canvas: "{nodes:" });
  assertEquals(r.ok, false);
  assertEquals(!r.ok && r.erro.startsWith('"canvas" precisa ser JSON válido'), true);
});

Deno.test("prepararArgs recusa tool desconhecida", () => {
  assertEquals(prepararArgs("marketing_nao_existe", {}).ok, false);
});
