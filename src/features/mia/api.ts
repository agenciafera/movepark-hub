import { useMutation } from "@tanstack/react-query";

/**
 * Conversa com a Mia, o agente de WhatsApp da Movepark, para teste interno.
 *
 * ## Por que a chamada é direta, e não por Edge Function
 *
 * A Mia roda no BeastBots (repo separado, `agenciafera/beast-bots`). Uma Edge do
 * Supabase é a arquitetura certa para produção, porque o `/api/*` do Mastra exige
 * `MASTRA_ADMIN_TOKEN` e esse segredo não pode viver num bundle público.
 *
 * Só que hoje a Mia roda no `localhost:4111` de quem está testando, e uma Edge na
 * nuvem **não alcança o localhost de ninguém**. Uma Edge escrita agora seria código
 * morto até o BeastBots subir na Cloudflare.
 *
 * Então: enquanto for teste local, o navegador fala direto. Quando o BeastBots
 * estiver publicado, entra a Edge no meio, o `MIA_URL` aponta para ela, e este
 * arquivo muda numa linha.
 */
export const MIA_URL = (import.meta.env.VITE_MIA_URL as string | undefined)?.replace(/\/+$/, "");

/** Sem URL configurada não existe bolinha: nada de botão que só sabe dar erro. */
export function miaConfigurada(): boolean {
  return !!MIA_URL;
}

export type MiaTurno = { role: "user" | "model"; text: string };

export type MiaResposta = { reply: string; tools: string[] };

type GenerateResponse = {
  text?: string;
  steps?: Array<{ toolCalls?: Array<{ payload?: { toolName?: string } }> }>;
};

/**
 * Identidade de teste.
 *
 * O telefone NÃO é o de quem está logado, e isso é de propósito: a Mia usa o
 * número da conversa como prova de posse para consultar reserva (D43). Passar o
 * telefone real de um admin faria o teste devolver a reserva dele de verdade, com
 * placa e voucher, dentro do Backoffice.
 *
 * A memória é por usuário para dois testadores não dividirem a mesma conversa, e
 * o prefixo `movepark-hub:` é o que o guarda de namespace do BeastBots exige.
 */
export function identidadeDeTeste(userId: string, nome: string | null) {
  return {
    requestContext: {
      "movepark.customerPhone": "5500000000000",
      "movepark.customerName": nome ?? "Backoffice (teste)",
      "movepark.origin": "webchat-bot",
    },
    memory: {
      resource: `movepark-hub:manager:${userId}`,
      thread: `movepark-hub:manager:${userId}:main`,
    },
  };
}

export function useEnviarParaMia(userId: string, nome: string | null) {
  return useMutation({
    mutationFn: async (turnos: MiaTurno[]): Promise<MiaResposta> => {
      if (!MIA_URL) throw new Error("VITE_MIA_URL não configurada.");

      const { requestContext, memory } = identidadeDeTeste(userId, nome);
      const res = await fetch(`${MIA_URL}/api/agents/movepark-hub/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: turnos.map((t) => ({
            role: t.role === "model" ? "assistant" : "user",
            content: t.text,
          })),
          requestContext,
          memory,
        }),
      });

      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "A Mia recusou a chamada (401). Em produção o /api do Mastra exige token, e o navegador não tem."
            : `A Mia respondeu ${res.status}. Ela está rodando em ${MIA_URL}?`,
        );
      }

      const data = (await res.json()) as GenerateResponse;
      const tools = (data.steps ?? []).flatMap((s) =>
        (s.toolCalls ?? []).map((c) => c.payload?.toolName ?? "").filter(Boolean),
      );
      return { reply: data.text?.trim() || "(a Mia não respondeu nada)", tools };
    },
  });
}
