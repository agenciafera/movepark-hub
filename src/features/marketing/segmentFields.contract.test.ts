import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEGMENT_FIELDS } from "./segmentBuilder.logic";

/**
 * O catálogo de campos existe em dois lugares: SEGMENT_FIELDS (a tela) e marketing_segment_fields()
 * (o banco, que valida o segmento e responde à IA pelo MCP). Este contrato lê a migration MAIS
 * RECENTE que define a função e reprova se as chaves ou os tipos divergirem. Lia um arquivo fixo e,
 * quando o catálogo mudou em outra migration, passou a comparar com a versão velha.
 * Spec: docs/specs/marketing-mcp.md § 3 e assistente-marketing-proativo.md § 3.
 */
const pasta = `${process.cwd()}/supabase/migrations`;
const ultima = readdirSync(pasta)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => readFileSync(`${pasta}/${f}`, "utf8").includes("function public.marketing_segment_fields()"))
  .at(-1);
const sql = readFileSync(`${pasta}/${ultima}`, "utf8");
const doBanco = [
  ...sql.matchAll(/\('([a-z_0-9]+)', '(number|money|text|enum|boolean|tags)'/g),
].map((m) => [m[1], m[2]] as const);

describe("catálogo de campos de segmento: tela ↔ banco", () => {
  it("mesmas chaves e mesmos tipos", () => {
    expect(new Map(doBanco)).toEqual(new Map(SEGMENT_FIELDS.map((f) => [f.key, f.kind])));
  });
});
