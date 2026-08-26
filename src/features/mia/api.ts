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
    mutationFn: async (texto: string): Promise<MiaResposta> => {
      const { data, error } = await supabase.functions.invoke("mia-chat", {
        // UMA mensagem, nunca o histórico.
        //
        // A Edge passa `memory`, entao o Mastra ja recupera a conversa do banco. Mandar
        // o historico junto entregava tudo DUAS vezes ao modelo: em 26/08 um turno saiu
        // com 19 mensagens no corpo e 124 na memoria da mesma thread. Isso infla token,
        // atrasa a resposta e faz o modelo ver o mesmo turno repetido.
        //
        // E o que o WhatsApp sempre fez: a Evolution manda uma mensagem, a memoria cuida
        // do resto. Os dois caminhos agora falam igual.
        body: { messages: [{ role: "user", content: texto }] },
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

/**
 * Apaga a conversa de teste, no servidor e na tela.
 *
 * Interface tem botão; WhatsApp é que precisa de comando digitado (lá existe `/limpar`,
 * em `platform/channels/comandos.ts` do BeastBots). A thread apagada é sempre a de quem
 * clicou: a Edge a deriva do JWT, e o navegador não escolhe qual.
 */
export function useLimparConversaDaMia() {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.functions.invoke("mia-chat", { body: { acao: "limpar" } });
      if (error) {
        const detalhe = await lerErro(error);
        throw new Error(detalhe ?? "Não consegui limpar a conversa agora.");
      }
    },
  });
}
