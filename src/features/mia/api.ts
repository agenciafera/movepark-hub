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
 * ## O que o navegador manda, e o que ele nunca monta
 *
 * Manda mensagem, telefone e origem. O telefone é escolhido de propósito: esta é a
 * bancada do time, e simular o atendimento de um cliente real é o que ela serve para
 * fazer. O que o navegador NÃO faz é montar o `requestContext`: quem monta é a Edge,
 * campo a campo, depois de conferir o formato do número e a origem contra uma lista
 * fechada. Nome e namespace de memória continuam saindo do JWT, e a thread nunca é a
 * do WhatsApp de verdade daquele número. Ver o cabeçalho de `supabase/functions/mia-chat`.
 */
export type MiaTurno = { role: "user" | "model"; text: string };

export type MiaResposta = { reply: string; tools: string[]; blocos: string[] };

/** As origens que o white-label conhece. A Edge recusa qualquer outra. */
export const ORIGENS_DA_MIA = [
  { valor: "webchat-bot", rotulo: "Webchat (esta bolinha)" },
  { valor: "whatsapp-bot", rotulo: "WhatsApp" },
] as const;

export type OrigemDaMia = (typeof ORIGENS_DA_MIA)[number]["valor"];

/** Quem a Mia pensa que está atendendo. */
export type IdentidadeSimulada = { telefone: string; origem: OrigemDaMia };

type GenerateResponse = {
  text?: string;
  /** Mensagens que o canal manda ANTES da resposta, como a saudação do primeiro contato. */
  blocos?: string[];
  steps?: Array<{ toolCalls?: Array<{ payload?: { toolName?: string } }> }>;
};

export function useEnviarParaMia() {
  return useMutation({
    mutationFn: async ({
      texto,
      identidade,
    }: {
      texto: string;
      identidade: IdentidadeSimulada;
    }): Promise<MiaResposta> => {
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
        body: {
          messages: [{ role: "user", content: texto }],
          telefone: identidade.telefone,
          origem: identidade.origem,
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
      return {
        reply: resposta.text?.trim() || "(a Mia não respondeu nada)",
        tools,
        // Vêm separados de propósito: são mensagens distintas na tela, como no WhatsApp.
        blocos: (resposta.blocos ?? []).filter((b) => b?.trim()),
      };
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
 * O botão existe aqui e o comando `/limpar` existe em todo canal (ele mora na porta
 * `/chat` do BeastBots, em `platform/channels/comandos.ts`): os dois caminhos apagam a
 * mesma thread.
 *
 * Qual thread depende do telefone simulado, porque cada número tem a sua. O `uid` nunca
 * vem do navegador: quem o deriva é a Edge, a partir do JWT, então um admin só apaga
 * conversa de teste dele.
 */
export function useLimparConversaDaMia() {
  return useMutation({
    mutationFn: async (identidade: IdentidadeSimulada): Promise<void> => {
      const { error } = await supabase.functions.invoke("mia-chat", {
        body: { acao: "limpar", telefone: identidade.telefone },
      });
      if (error) {
        const detalhe = await lerErro(error);
        throw new Error(detalhe ?? "Não consegui limpar a conversa agora.");
      }
    },
  });
}

/**
 * A conversa que já existe daquele número, para a tela abrir onde parou.
 *
 * A memória vive no servidor e sobrevive ao F5; a lista da tela é estado do navegador e
 * não sobrevive. Sem isto, recarregar mostrava conversa vazia enquanto a Mia continuava
 * lembrando de tudo, e a bancada mentia sobre o próprio estado.
 *
 * Falha aqui **não** impede conversar: quem abriu quer testar o agente, e um histórico
 * que não carregou é um incômodo, não um bloqueio. O erro aparece, a conversa segue.
 */
export function useHistoricoDaMia() {
  return useMutation({
    mutationFn: async (identidade: IdentidadeSimulada): Promise<MiaTurno[]> => {
      const { data, error } = await supabase.functions.invoke("mia-chat", {
        body: { acao: "historico", telefone: identidade.telefone },
      });
      if (error) {
        const detalhe = await lerErro(error);
        throw new Error(detalhe ?? "Não consegui carregar a conversa anterior.");
      }
      return ((data as { mensagens?: MiaTurno[] })?.mensagens ?? []).filter((m) => m.text);
    },
  });
}
