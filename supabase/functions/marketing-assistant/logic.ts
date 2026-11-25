// Assistente da tela de Automação: o laço de um turno com o Gemini, sem rede nem banco.
//
// As dependências (Gemini, execução de tool, resumo do cartão) chegam injetadas, para o teste
// provar a regra que importa: as duas tools de disparo NUNCA executam dentro do laço; viram proposta
// e esperam o clique do admin. Spec: docs/specs/assistente-marketing.md § 3 e § 5.

import { prepararArgs } from "../_shared/marketing/gemini.ts";
import { MARKETING_TOOLS } from "../_shared/marketing/tools.ts";
import type { PaginaDoAdmin } from "../_shared/marketing/assistant-prompt.ts";

// ── Wire do Gemini (v1beta generateContent) ─────────────────────────────────
export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export const DISPATCH_TOOLS = new Set(["marketing_run_campaign", "marketing_set_dispatch_enabled"]);
const WRITE_TOOLS = new Set(MARKETING_TOOLS.filter((t) => t.scope === "marketing:write").map((t) => t.name));
export const MAX_ROUNDS = 8;
export const MAX_MENSAGENS = 20;
const MAX_TEXTO = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Mensagem = { papel: "usuario" | "assistente"; texto: string };
export type Pagina = PaginaDoAdmin;
export type Proposta = { tool: string; args: Record<string, unknown>; resumo: Record<string, unknown> };
export type Turno = {
  resposta: string;
  ferramentas: Array<{ nome: string; ok: boolean }>;
  propostas: Proposta[];
  gravou: boolean;
};
export type ToolFn = (nome: string, args: Record<string, unknown>) => Promise<unknown>;
export type TurnoDeps = {
  gemini: (contents: GeminiContent[]) => Promise<GeminiContent | null>;
  tool: ToolFn;
  resumir: (nome: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const AVISO_FALHA = "Não consegui falar com o modelo agora. Tente de novo em alguns segundos.";
const AVISO_LIMITE =
  "Não consegui concluir em poucas etapas. Tente dividir o pedido em partes menores.";

function erroLegivel(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function lerConversa(
  body: unknown,
): { ok: true; mensagens: Mensagem[]; pagina: Pagina } | { ok: false; erro: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const brutas = Array.isArray(b.mensagens) ? b.mensagens : [];
  const mensagens = brutas
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .filter((m) => (m.papel === "usuario" || m.papel === "assistente") && typeof m.texto === "string")
    .map((m) => ({ papel: m.papel as Mensagem["papel"], texto: String(m.texto).slice(0, MAX_TEXTO).trim() }))
    .filter((m) => m.texto.length > 0)
    .slice(-MAX_MENSAGENS);
  if (mensagens.length === 0 || mensagens[mensagens.length - 1].papel !== "usuario") {
    return { ok: false, erro: "Mande uma mensagem." };
  }
  const p = (b.pagina && typeof b.pagina === "object" ? b.pagina : {}) as Record<string, unknown>;
  const pagina: Pagina = {};
  if (typeof p.caminho === "string") pagina.caminho = p.caminho.slice(0, 200);
  if (typeof p.campaign_id === "string" && UUID.test(p.campaign_id)) pagina.campaign_id = p.campaign_id;
  if (typeof p.segment_id === "string" && UUID.test(p.segment_id)) pagina.segment_id = p.segment_id;
  return { ok: true, mensagens, pagina };
}

export function toContents(mensagens: Mensagem[]): GeminiContent[] {
  return mensagens.map((m) => ({
    role: m.papel === "usuario" ? "user" : "model",
    parts: [{ text: m.texto }],
  }));
}

function chamadas(c: GeminiContent): Array<{ name: string; args: Record<string, unknown> }> {
  return (c.parts ?? [])
    .map((p) => p.functionCall)
    .filter((f): f is { name: string; args: Record<string, unknown> } => !!f);
}

function textoDe(c: GeminiContent): string {
  return (c.parts ?? []).map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim();
}

export async function rodarTurno(mensagens: Mensagem[], deps: TurnoDeps): Promise<Turno> {
  const contents = toContents(mensagens);
  const ferramentas: Turno["ferramentas"] = [];
  const propostas: Proposta[] = [];
  let gravou = false;

  for (let rodada = 0; rodada < MAX_ROUNDS; rodada++) {
    let resp: GeminiContent | null;
    try {
      resp = await deps.gemini(contents);
    } catch {
      resp = null;
    }
    if (!resp) return { resposta: AVISO_FALHA, ferramentas, propostas, gravou };

    const pedidas = chamadas(resp);
    if (pedidas.length === 0) {
      return { resposta: textoDe(resp) || "Pronto.", ferramentas, propostas, gravou };
    }

    contents.push(resp);
    const resultados: Array<{ name: string; response: Record<string, unknown> }> = [];

    for (const c of pedidas) {
      const preparado = prepararArgs(c.name, c.args ?? {});
      if (!preparado.ok) {
        resultados.push({ name: c.name, response: { erro: preparado.erro } });
        ferramentas.push({ nome: c.name, ok: false });
        continue;
      }

      if (DISPATCH_TOOLS.has(c.name)) {
        try {
          const resumo = await deps.resumir(c.name, preparado.args);
          propostas.push({ tool: c.name, args: preparado.args, resumo });
          resultados.push({
            name: c.name,
            response: {
              status: "proposta_criada",
              mensagem: "O admin vê um cartão com o efeito e decide se confirma. Nada foi executado.",
              resumo,
            },
          });
          ferramentas.push({ nome: c.name, ok: true });
        } catch (e) {
          resultados.push({ name: c.name, response: { erro: erroLegivel(e) } });
          ferramentas.push({ nome: c.name, ok: false });
        }
        continue;
      }

      try {
        const r = await deps.tool(c.name, preparado.args);
        resultados.push({ name: c.name, response: { resultado: r as unknown } as Record<string, unknown> });
        ferramentas.push({ nome: c.name, ok: true });
        if (WRITE_TOOLS.has(c.name)) gravou = true;
      } catch (e) {
        resultados.push({ name: c.name, response: { erro: erroLegivel(e) } });
        ferramentas.push({ nome: c.name, ok: false });
      }
    }

    contents.push({
      role: "user",
      parts: resultados.map((r) => ({ functionResponse: { name: r.name, response: r.response } })),
    });
  }

  return { resposta: AVISO_LIMITE, ferramentas, propostas, gravou };
}

/** O que o cartão mostra antes do clique: o efeito, com número que veio das tools. */
export async function resumirProposta(
  nome: string,
  args: Record<string, unknown>,
  tool: ToolFn,
): Promise<Record<string, unknown>> {
  if (nome === "marketing_run_campaign") {
    const c = (await tool("marketing_get_campaign", { campaign_id: args.campaign_id })) as {
      campanha?: { name?: string; status?: string; segment_id?: string | null };
      problemas?: string[];
    };
    const cfg = (await tool("marketing_get_dispatch_config", {})) as { enabled?: boolean };
    let seg: { name?: string; total?: number; reachable_email?: number; reachable_whatsapp?: number } | null =
      null;
    if (c?.campanha?.segment_id) {
      const l = (await tool("marketing_list_segments", {})) as {
        segmentos?: Array<{ id: string; name?: string; total?: number; reachable_email?: number; reachable_whatsapp?: number }>;
      };
      seg = l?.segmentos?.find((s) => s.id === c.campanha?.segment_id) ?? null;
    }
    return {
      campanha: c?.campanha?.name ?? null,
      status: c?.campanha?.status ?? null,
      segmento: seg?.name ?? null,
      publico: seg?.total ?? 0,
      alcance_email: seg?.reachable_email ?? 0,
      alcance_whatsapp: seg?.reachable_whatsapp ?? 0,
      disparo_ligado: cfg?.enabled === true,
      problemas: c?.problemas ?? [],
    };
  }
  if (nome === "marketing_set_dispatch_enabled") {
    const cfg = (await tool("marketing_get_dispatch_config", {})) as { enabled?: boolean };
    return {
      ligar: args.enabled === true,
      motivo: String(args.reason ?? ""),
      disparo_ligado_agora: cfg?.enabled === true,
    };
  }
  return {};
}

/** O clique em Confirmar: só as duas tools de disparo, com o que cada uma exige. */
export function lerConfirmacao(
  body: unknown,
): { ok: true; tool: string; args: Record<string, unknown> } | { ok: false; erro: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const tool = String(b.tool ?? "");
  const args = (b.args && typeof b.args === "object" ? b.args : {}) as Record<string, unknown>;
  if (!DISPATCH_TOOLS.has(tool)) return { ok: false, erro: "Só execução de campanha e chave geral passam por confirmação." };
  if (tool === "marketing_run_campaign") {
    if (typeof args.campaign_id !== "string" || !args.campaign_id) {
      return { ok: false, erro: "Falta a campanha." };
    }
    return { ok: true, tool, args: { campaign_id: args.campaign_id, ...(typeof args.limit === "number" ? { limit: args.limit } : {}) } };
  }
  if (typeof args.enabled !== "boolean" || !String(args.reason ?? "").trim()) {
    return { ok: false, erro: "Falta dizer se liga ou desliga, e o motivo." };
  }
  return { ok: true, tool, args: { enabled: args.enabled, reason: String(args.reason) } };
}
