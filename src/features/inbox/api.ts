import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export type ConversaDaLista = {
  id: string;
  telefone: string;
  titulo: string | null;
  ultima_em: string | null;
  ultimo_papel: string | null;
  ultimo_texto: string | null;
  total: number;
  lida_ate: string | null;
  assumida_por: string | null;
  assumida_em: string | null;
};

export type FalaDaConversa = { papel: "cliente" | "agente"; texto: string; em: string };

export type ConversaAberta = {
  threadId: string;
  telefone: string;
  lidaAte: string | null;
  assumidaPor: string | null;
  falas: FalaDaConversa[];
};

export const inboxKeys = {
  all: ["inbox"] as const,
  lista: () => [...inboxKeys.all, "lista"] as const,
  conversa: (id: string) => [...inboxKeys.all, "conversa", id] as const,
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
 * A lista de conversas.
 *
 * O `ligado` existe porque a sidebar usa esta mesma query para o contador de não lidas,
 * e ela é renderizada também no painel do operador, onde a caixa de entrada não existe.
 * Sem o desligamento, todo operador ficaria chamando a Edge a cada 15 segundos para um
 * número que a tela dele nem mostra.
 */
export function useConversas(ligado = true) {
  return useQuery({
    enabled: ligado,
    queryKey: inboxKeys.lista(),
    queryFn: () =>
      chamar<{ conversas: ConversaDaLista[] }>(
        { acao: "listar" },
        "Não consegui carregar as conversas.",
      ).then((r) => r.conversas ?? []),
    // A conversa acontece no WhatsApp, fora daqui: sem isso a lista envelhece na tela.
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
    // Mais curto que a lista: aqui alguém está lendo agora.
    refetchInterval: 8_000,
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
