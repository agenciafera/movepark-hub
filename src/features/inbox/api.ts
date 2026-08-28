import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Caixa de entrada das conversas da Mia.
 *
 * ## Por que passa por uma Edge
 *
 * As conversas moram no Postgres do BeastBots, que é **outro projeto Supabase**. O
 * cliente daqui não alcança aquele banco, e o `/inbox` de lá exige o
 * `MASTRA_ADMIN_TOKEN`, que não pode viver num bundle servido ao navegador. A Edge
 * `mia-inbox` confere o papel e guarda o segredo.
 *
 * ## Sem tempo real, e é por isso
 *
 * O `useLeadsRealtime` que existe no projeto escuta o Postgres do Hub. Estas conversas
 * estão noutro projeto, fora do alcance do canal. Então é polling, com intervalo curto
 * na conversa aberta e mais folgado na lista.
 */

export type OrigemDaConversa = "whatsapp" | "webchat";

export type ConversaDaLista = {
  id: string;
  telefone: string;
  origem: OrigemDaConversa;
  titulo: string | null;
  ultima_em: string | null;
  ultimo_papel: string | null;
  ultimo_texto: string | null;
  total: number;
  lida_ate: string | null;
  assumida_por: string | null;
  assumida_em: string | null;
};

/** A ficha de um anexo. Os bytes vêm depois, por `useAnexo`. */
export type AnexoDaFala = {
  parte: number;
  mime: string;
  tipo: "imagem" | "audio" | "video" | "figurinha" | "arquivo";
  nome: string;
  bytes: number;
};

export type FalaDaConversa = {
  id: string;
  papel: "cliente" | "agente";
  /** Quem escreveu: "Mia", o nome de quem assumiu, ou vazio na fala do cliente. */
  autor: string;
  texto: string;
  em: string;
  anexos: AnexoDaFala[];
};

export type ConversaAberta = {
  threadId: string;
  telefone: string;
  lidaAte: string | null;
  assumidaPor: string | null;
  falas: FalaDaConversa[];
};

export const inboxKeys = {
  all: ["inbox"] as const,
  lista: (busca: string) => [...inboxKeys.all, "lista", busca] as const,
  conversa: (id: string) => [...inboxKeys.all, "conversa", id] as const,
  anexo: (msg: string, parte: number) => [...inboxKeys.all, "anexo", msg, parte] as const,
};

/** A mensagem de erro da Edge é mais útil que "FunctionsHttpError". */
async function lerErro(error: unknown): Promise<string | undefined> {
  const contexto = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  try {
    const corpo = (await contexto?.json?.()) as { error?: string } | undefined;
    return corpo?.error;
  } catch {
    return error instanceof Error ? error.message : undefined;
  }
}

async function chamar<T>(body: Record<string, unknown>, seDerErrado: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("mia-inbox", { body });
  if (error) throw new Error((await lerErro(error)) ?? seDerErrado);
  return data as T;
}

/**
 * A lista de conversas, paginada por cursor e buscada no servidor.
 *
 * ## Por que rolagem infinita, e não tudo de uma vez
 *
 * A primeira versão trazia tudo e filtrava no navegador. Funcionava com cem conversas e
 * não funcionaria com mil: cada abertura da tela baixaria a lista inteira, e o polling
 * repetiria isso a cada quinze segundos.
 *
 * ## Por que o cursor é um horário, e não um número de página
 *
 * A ordem muda a cada mensagem que chega. Com `offset`, uma conversa que sobe para o
 * topo enquanto alguém rola faz a página seguinte repetir uma linha e pular outra. O
 * cursor é o horário da última conversa vista, então a página seguinte começa
 * exatamente onde a anterior parou.
 *
 * O `ligado` existe porque a sidebar usa isto para o contador de não lidas, e ela é
 * renderizada também no painel do operador, onde a caixa de entrada não existe.
 */
export function useConversas(ligado = true, busca = "") {
  return useInfiniteQuery({
    enabled: ligado,
    queryKey: inboxKeys.lista(busca),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      chamar<{ conversas: ConversaDaLista[]; proximoCursor: string | null }>(
        { acao: "listar", limite: 30, busca, cursor: pageParam },
        "Não consegui carregar as conversas.",
      ),
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
    /**
     * O polling vale só para a PRIMEIRA página.
     *
     * `refetchInterval` numa infinite query recarrega todas as páginas já abertas, e a
     * cada quinze segundos isso seria a lista inteira de novo, que é justamente o que a
     * paginação existe para evitar. `maxPages: 1` no refetch não existe na API, então o
     * intervalo fica curto o bastante para a conversa nova aparecer e a rolagem funciona
     * por demanda.
     */
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useConversa(threadId: string | null) {
  return useQuery({
    queryKey: inboxKeys.conversa(threadId ?? ""),
    enabled: !!threadId,
    queryFn: () =>
      chamar<ConversaAberta>(
        { acao: "abrir", threadId },
        "Não consegui abrir esta conversa.",
      ),
    /**
     * Mais curto que a lista: aqui alguém está lendo agora, e numa conversa assumida
     * está esperando o cliente responder. Oito segundos era tempo demais para quem
     * atende de verdade.
     */
    refetchInterval: 4_000,
  });
}

/**
 * Marcar como lida (ou não lida, com `lidaAte: null`).
 *
 * Invalida a lista **e** a conversa: o badge do menu e o destaque da linha saem da
 * lista, e o estado de leitura aparece nas duas telas.
 */
export function useMarcarConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, lida }: { threadId: string; lida: boolean }) =>
      chamar<{ ok: boolean }>(
        { acao: "marcar", threadId, lidaAte: lida ? new Date().toISOString() : null },
        "Não consegui marcar esta conversa.",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export function useAssumirConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId }: { threadId: string }) =>
      chamar<{ ok: boolean }>({ acao: "assumir", threadId }, "Não consegui assumir a conversa."),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export function useDevolverConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId }: { threadId: string }) =>
      chamar<{ ok: boolean }>({ acao: "devolver", threadId }, "Não consegui devolver a conversa."),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export function useResponderConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, texto }: { threadId: string; texto: string }) =>
      chamar<{ ok: boolean }>({ acao: "responder", threadId, texto }, "Não consegui enviar."),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

/**
 * Os bytes de um anexo, buscados só quando a tela vai mostrá-lo.
 *
 * O adapter guarda a mídia inline, em base64, dentro da mensagem: medido no banco, média
 * de 319 KB por anexo e uma conversa somando 2,8 MB. Trazer isso na abertura faria a
 * tela esperar megabytes antes da primeira linha. Assim a conversa abre em 5 KB e cada
 * anexo chega sozinho.
 *
 * `staleTime: Infinity` porque anexo não muda: uma vez carregado, fica.
 */
/**
 * Os bytes de um anexo, sem passar pelo React.
 *
 * A imagem da conversa é desenhada fora de qualquer componente, e lá não há hook. É a
 * mesma chamada do `useAnexo`, exposta para quem precisa dos bytes e não do estado.
 */
export function buscarAnexo(threadId: string, messageId: string, parte: number) {
  return chamar<{ dados: string; nome: string }>(
    { acao: "anexo", threadId, messageId, parte },
    "Não consegui carregar o anexo.",
  );
}

export function useAnexo(threadId: string | null, messageId: string, parte: number, ligado: boolean) {
  return useQuery({
    queryKey: inboxKeys.anexo(messageId, parte),
    enabled: ligado && !!threadId && !!messageId,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    queryFn: () => buscarAnexo(threadId!, messageId, parte),
  });
}
