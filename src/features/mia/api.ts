import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Conversa com a Mia, o agente de WhatsApp da Movepark, para teste interno.
 *
 * ## Por que passa por uma Edge
 *
 * A Mia roda no BeastBots (repo separado, `agenciafera/beast-bots`), e o `/api/*` do
 * Mastra exige o `MASTRA_ADMIN_TOKEN`, que dá acesso total aos dois agentes. Esse
 * segredo não pode viver num bundle servido a quem baixar o JS, então o navegador nunca
 * fala com o BeastBots direto.
 *
 * Houve uma fase em que ele falava, por `VITE_MIA_URL`, porque a Mia só existia no
 * `localhost:4111` de quem testava e uma Edge na nuvem não alcança localhost nenhum.
 * Aquilo era teste local e a variável ficava vazia em produção, o que deixava a bolinha
 * invisível no Manager publicado. Com o BeastBots no ar, a Edge entrou e a variável
 * saiu.
 *
 * ## O que o navegador NÃO manda
 *
 * Só as mensagens. Telefone, nome e namespace de memória são montados na Edge a partir
 * do JWT. A Mia usa o telefone da conversa como prova de posse para consultar reserva
 * (D43): se o navegador mandasse esse campo, um admin poderia trocar o número e puxar a
 * reserva de um cliente real, com placa e voucher, de dentro do Backoffice.
 */
export type MiaTurno = { role: "user" | "model"; text: string };

export type MiaResposta = { reply: string; tools: string[] };

type GenerateResponse = {
  text?: string;
  steps?: Array<{ toolCalls?: Array<{ payload?: { toolName?: string } }> }>;
};

export function useEnviarParaMia() {
  return useMutation({
    mutationFn: async (turnos: MiaTurno[]): Promise<MiaResposta> => {
      const { data, error } = await supabase.functions.invoke("mia-chat", {
        body: {
          messages: turnos.map((t) => ({
            role: t.role === "model" ? "assistant" : "user",
            content: t.text,
          })),
        },
      });

      if (error) {
        // A mensagem da Edge é mais útil que "FunctionsHttpError": ela distingue
        // "acesso restrito" de "a Mia não respondeu".
        const detalhe = await lerErro(error);
        throw new Error(detalhe ?? "Não consegui falar com a Mia agora.");
      }

      const resposta = data as GenerateResponse;
      const tools = (resposta.steps ?? []).flatMap((s) =>
        (s.toolCalls ?? []).map((c) => c.payload?.toolName ?? "").filter(Boolean),
      );
      return { reply: resposta.text?.trim() || "(a Mia não respondeu nada)", tools };
    },
  });
}

/** O corpo de erro da Edge, quando ela mandou um. */
async function lerErro(error: unknown): Promise<string | undefined> {
  const contexto = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  try {
    const corpo = (await contexto?.json?.()) as { error?: string } | undefined;
    return corpo?.error;
  } catch {
    return error instanceof Error ? error.message : undefined;
  }
}
