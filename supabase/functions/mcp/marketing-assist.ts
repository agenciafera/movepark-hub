// Superfície /marketing do MCP: o agente movepark-marketing (beast-bots) agindo por um hub_admin.
// Ver docs/specs/assistente-marketing.md § 4.
//
// Leitura e gravação rodam pelo callMarketing de sempre, com o admin do token como ator na
// auditoria. As duas tools de disparo nunca executam aqui: viram proposta em
// marketing_assistant_action, presa ao admin e à conversa do token, e só o clique na Edge
// marketing-assistant executa.

import { callMarketing, type MarketingDeps } from "../_shared/marketing/handlers.ts";
import { DISPATCH_TOOLS, proporDisparo } from "../_shared/marketing/proposta.ts";
import type { Actor } from "../_shared/marketing/run.ts";

export interface MarketingAssistCtx {
  profile_id: string;
  conversa_id: string;
  label: string;
}

// deno-lint-ignore no-explicit-any
type Db = any;

export async function callMarketingAssist(
  admin: Db,
  ctx: MarketingAssistCtx,
  nome: string,
  args: Record<string, unknown>,
  deps: MarketingDeps & { chamar?: typeof callMarketing },
): Promise<unknown> {
  const chamar = deps.chamar ?? callMarketing;
  const ator: Actor = { kind: "hub_admin", id: ctx.profile_id, label: ctx.label };
  const tool = (n: string, a: Record<string, unknown>) => chamar(admin, ator, n, a, deps);

  if (DISPATCH_TOOLS.has(nome)) {
    return await proporDisparo(nome, args, {
      tool,
      gravar: async (linha) => {
        const { data, error } = await admin
          .from("marketing_assistant_action")
          .insert({
            profile_id: ctx.profile_id,
            conversa_id: ctx.conversa_id,
            tool: linha.tool,
            args: linha.args,
            resumo: linha.resumo,
            status: linha.status,
          })
          .select("id")
          .single();
        if (error) throw error;
        return String(data.id);
      },
    });
  }
  return await tool(nome, args);
}
