// Proposta de disparo do assistente da Automação (docs/specs/assistente-marketing.md § 4).
//
// As duas tools de disparo (executar campanha, ligar ou desligar a chave geral) nunca executam
// pela superfície /marketing do MCP. Viram uma linha em marketing_assistant_action, com o resumo
// do efeito, e só o clique do admin na Edge marketing-assistant executa, com os argumentos
// gravados aqui.

export const DISPATCH_TOOLS = new Set(["marketing_run_campaign", "marketing_set_dispatch_enabled"]);

export type ToolFn = (nome: string, args: Record<string, unknown>) => Promise<unknown>;

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

/** Os argumentos que a proposta grava: só o que cada tool de disparo aceita. */
export function argsDaProposta(
  nome: string,
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; erro: string } {
  if (nome === "marketing_run_campaign") {
    if (typeof args.campaign_id !== "string" || !args.campaign_id) return { ok: false, erro: "Falta a campanha." };
    return {
      ok: true,
      args: { campaign_id: args.campaign_id, ...(typeof args.limit === "number" ? { limit: args.limit } : {}) },
    };
  }
  if (nome === "marketing_set_dispatch_enabled") {
    if (typeof args.enabled !== "boolean" || !String(args.reason ?? "").trim()) {
      return { ok: false, erro: "Falta dizer se liga ou desliga, e o motivo." };
    }
    return { ok: true, args: { enabled: args.enabled, reason: String(args.reason).trim() } };
  }
  return { ok: false, erro: "Só execução de campanha e chave geral viram proposta." };
}

export type GravarProposta = (linha: {
  tool: string;
  args: Record<string, unknown>;
  resumo: Record<string, unknown>;
  status: "proposed" | "blocked";
}) => Promise<string>;

/**
 * Monta e grava a proposta. Erro de argumento volta como dado (`{ ok: false, erro }`), porque o
 * MCP só repassa ao agente mensagem de erro de negócio, e o agente precisa saber o que corrigir.
 */
export async function proporDisparo(
  nome: string,
  args: Record<string, unknown>,
  deps: { tool: ToolFn; gravar: GravarProposta },
): Promise<Record<string, unknown>> {
  const a = argsDaProposta(nome, args);
  if (!a.ok) return { ok: false, erro: a.erro };
  const resumo = await resumirProposta(nome, a.args, deps.tool);
  const problemas = Array.isArray(resumo.problemas) ? resumo.problemas : [];
  const status = problemas.length > 0 ? "blocked" : "proposed";
  const id = await deps.gravar({ tool: nome, args: a.args, resumo, status });
  return {
    status: "proposta",
    proposta_id: id,
    tool: nome,
    resumo,
    aviso: status === "blocked"
      ? "A campanha tem problemas e o cartão não oferece Confirmar. Corrija e peça de novo."
      : "Aguardando o clique do admin no cartão. Nada foi executado.",
  };
}
