// Adaptador das tools de marketing para o Gemini (function-calling, v1beta).
//
// O Gemini aceita um subconjunto do JSON Schema: recusa additionalProperties, ignora ou recusa format,
// e não sabe lidar com objeto livre (sem properties), que é o caso da definição de segmento e do
// fluxo de campanha. Esses viram texto JSON no lado do Gemini e são convertidos de volta antes do
// handler. Spec: docs/specs/assistente-marketing.md § 3.

import { MARKETING_TOOLS, type MarketingToolDef } from "./tools.ts";

export type GeminiDecl = { name: string; description: string; parameters: Record<string, unknown> };

function objetoLivre(s: Record<string, unknown>): boolean {
  return s.type === "object" && !s.properties;
}

export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "additionalProperties" || k === "format") continue;
    if (k === "properties" && v && typeof v === "object") {
      const props: Record<string, unknown> = {};
      for (const [nome, sub] of Object.entries(v as Record<string, Record<string, unknown>>)) {
        props[nome] = objetoLivre(sub)
          ? {
            type: "string",
            description: `${String(sub.description ?? "")} Envie como texto JSON.`.trim(),
          }
          : toGeminiSchema(sub);
      }
      out.properties = props;
      continue;
    }
    if (k === "items" && v && typeof v === "object") {
      out.items = toGeminiSchema(v as Record<string, unknown>);
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function marketingGeminiDecls(tools: MarketingToolDef[] = MARKETING_TOOLS): GeminiDecl[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.inputSchema),
  }));
}

/** Campos de objeto livre da tool: no Gemini eles viajam como texto JSON. */
export function camposJson(tool: MarketingToolDef): string[] {
  const props = (tool.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(props).filter(([, s]) => objetoLivre(s)).map(([nome]) => nome);
}

/** Converte de volta o texto JSON dos campos livres. Erro legível volta ao modelo para ele corrigir. */
export function prepararArgs(
  nome: string,
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; erro: string } {
  const tool = MARKETING_TOOLS.find((t) => t.name === nome);
  if (!tool) return { ok: false, erro: `Tool desconhecida: ${nome}` };
  const saida: Record<string, unknown> = { ...(args ?? {}) };
  for (const campo of camposJson(tool)) {
    const v = saida[campo];
    if (typeof v !== "string") continue;
    try {
      saida[campo] = JSON.parse(v);
    } catch (e) {
      return {
        ok: false,
        erro: `"${campo}" precisa ser JSON válido: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  return { ok: true, args: saida };
}
