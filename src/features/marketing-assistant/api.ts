import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { marketingKeys } from "@/features/marketing/api";
import { supabase } from "@/lib/supabase";
import { esperandoTitulo, pedidoDoTurno, type Proposta } from "./conversa.logic";

/**
 * A página Assistente de IA, pela Edge `marketing-assistant`. O navegador nunca fala com o
 * beast-bots nem com o modelo: a Edge confere o hub_admin e é a ponte. Executar campanha e mudar a
 * chave geral voltam como proposta, e só o clique em Confirmar executa.
 * Ver docs/specs/assistente-marketing.md § 6.
 */

const URL_DA_EDGE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/marketing-assistant`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const assistenteKeys = {
  all: ["marketing-assistant"] as const,
  conversas: () => [...assistenteKeys.all, "conversas"] as const,
  conversa: (id: string) => [...assistenteKeys.all, "conversa", id] as const,
};

export type ConversaResumo = { id: string; titulo: string; atualizada_em: string };
export type ConversaAberta = { mensagens: UIMessage[]; propostas: Proposta[] };

async function cabecalhos(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { apikey: ANON, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function chamar<T>(body: Record<string, unknown>, padrao: string): Promise<T> {
  const res = await fetch(URL_DA_EDGE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cabecalhos()) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? padrao);
  return data as T;
}

export function useConversas() {
  return useQuery({
    queryKey: assistenteKeys.conversas(),
    queryFn: async () =>
      (await chamar<{ conversas: ConversaResumo[] }>({ acao: "conversas" }, "Não consegui carregar as conversas."))
        .conversas,
    // O título nasce em segundo plano no agente; enquanto falta, a lista recarrega.
    refetchInterval: (q) => (esperandoTitulo(q.state.data ?? [], Date.now()) ? 3000 : false),
  });
}

/** Conversa criada nesta página ainda não existe no agente: não há o que abrir. */
export function useConversa(id: string | undefined, nova: boolean) {
  return useQuery({
    queryKey: assistenteKeys.conversa(id ?? ""),
    enabled: !!id && !nova,
    staleTime: Infinity,
    queryFn: () => chamar<ConversaAberta>({ acao: "abrir", conversa_id: id }, "Não consegui abrir a conversa."),
  });
}

export function useRenomearConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { conversaId: string; titulo: string }) =>
      chamar<{ ok: true }>({ acao: "renomear", conversa_id: p.conversaId, titulo: p.titulo }, "Não consegui renomear."),
    onSuccess: () => void qc.invalidateQueries({ queryKey: assistenteKeys.conversas() }),
  });
}

export function useApagarConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { conversaId: string }) =>
      chamar<{ ok: true }>({ acao: "apagar", conversa_id: p.conversaId }, "Não consegui apagar."),
    onSuccess: () => void qc.invalidateQueries({ queryKey: assistenteKeys.all }),
  });
}

export function useDecidirProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { propostaId: string; decisao: "confirmar" | "descartar" }) =>
      (
        await chamar<{ proposta: Proposta }>(
          { acao: p.decisao, proposta_id: p.propostaId },
          p.decisao === "confirmar" ? "Não consegui executar agora." : "Não consegui descartar agora.",
        )
      ).proposta,
    // Executou campanha ou mudou a chave: as telas da Automação recarregam.
    onSuccess: (_r, p) => {
      if (p.decisao === "confirmar") void qc.invalidateQueries({ queryKey: marketingKeys.all });
    },
  });
}

/** Transporte do `useChat`: só a fala nova vai, com o JWT de agora. */
export function criarTransporte(conversaId: string) {
  return new DefaultChatTransport<UIMessage>({
    api: URL_DA_EDGE,
    prepareSendMessagesRequest: async ({ messages }) => ({
      headers: await cabecalhos(),
      body: pedidoDoTurno(conversaId, messages as Array<{ id: string; role: string; parts: unknown[] }>),
    }),
  });
}
