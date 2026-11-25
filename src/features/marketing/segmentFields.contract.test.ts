import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEGMENT_FIELDS } from "./segmentBuilder.logic";

/**
 * O catálogo de campos existe em dois lugares: SEGMENT_FIELDS (a tela) e marketing_segment_fields()
 * (o banco, que valida o segmento e responde à IA pelo MCP). Este contrato lê a migration como texto
 * e reprova se as chaves ou os tipos divergirem. Spec: docs/specs/marketing-mcp.md § 3.
 */
const sql = readFileSync(
  `${process.cwd()}/supabase/migrations/20261207110000_marketing_mcp_base.sql`,
  "utf8",
);
const doBanco = [
  ...sql.matchAll(/\('([a-z_0-9]+)', '(number|money|text|enum|boolean|tags)'/g),
].map((m) => [m[1], m[2]] as const);

describe("catálogo de campos de segmento: tela ↔ banco", () => {
  it("mesmas chaves e mesmos tipos", () => {
    expect(new Map(doBanco)).toEqual(new Map(SEGMENT_FIELDS.map((f) => [f.key, f.kind])));
  });
});
