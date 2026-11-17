import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CartaoDeAcao, Fala, PapelDaFala } from "./operatorAssistant.logic";

/**
 * A Mia para operadores, pela Edge `operator-assistant`.
 *
 * O navegador nunca fala com o beast-bots: a Edge confere a sessão e o vínculo com a empresa,
 * aplica o teto de uso, emite o token do turno e monta o contexto do agente. Aqui só vão a
 * mensagem, a empresa ativa e a página aberta. Ver docs/specs/assistente-do-operador.md.
 */

export const operatorAssistantKeys = {
  all: ["operator-assistant"] as const,
  historico: (companyId: string) => [...operatorAssistantKeys.all, "historico", companyId] as const,
  liberado: (companyId: string) => [...operatorAssistantKeys.all, "liberado", companyId] as const,
};

type RespostaDoEnvio = {
  reply: string;
  used_tools: string[];
  actions: CartaoDeAcao[];
  conversation_id: string;
};

type Historico = { falas: Fala[]; cartoes: CartaoDeAcao[] };

/** A mensagem de erro da Edge é mais útil que "FunctionsHttpError". */
async function lerErro(error: unknown, padrao: string): Promise<string> {
  const contexto = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  try {
    const corpo = (await contexto?.json?.()) as { error?: string } | undefined;
    return corpo?.error ?? padrao;
  } catch {
    return padrao;
  }
}

async function chamar<T>(body: Record<string, unknown>, padrao: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("operator-assistant", { body });
  if (error) throw new Error(await lerErro(error, padrao));
  return data as T;
}

let seq = 0;
const novoId = () => `fala-${++seq}`;

/**
 * A Mia está liberada nesta empresa? É a mesma função que a Edge consulta antes de atender
 * (`operator_assistant_liberado`): vínculo com a empresa, chave global e a lista do Manager.
 */
export function useAssistenteLiberado(companyId: string | null) {
  return useQuery({
    queryKey: operatorAssistantKeys.liberado(companyId ?? "nenhuma"),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("operator_assistant_liberado", {
        p_company_id: companyId as string,
      });
      if (error) throw error;
      return data === true;
    },
  });
}

export function useHistoricoDoAssistente(companyId: string | null, aberto: boolean) {
  return useQuery({
    queryKey: operatorAssistantKeys.historico(companyId ?? "nenhuma"),
    enabled: !!companyId && aberto,
    staleTime: 0,
    queryFn: async (): Promise<Historico> => {
      const r = await chamar<{
        mensagens: Array<{ role: PapelDaFala; text: string; action_ids: string[] }>;
        actions: CartaoDeAcao[];
      }>({ acao: "historico", company_id: companyId }, "Não consegui carregar a conversa.");
      return {
        falas: (r.mensagens ?? [])
          .filter((m) => m.text?.trim())
          .map((m) => ({ id: novoId(), role: m.role, text: m.text, actionIds: m.action_ids ?? [] })),
        cartoes: r.actions ?? [],
      };
    },
  });
}

export function useEnviarAoAssistente() {
  return useMutation({
    mutationFn: (p: { companyId: string; mensagem: string; pagina: string; bookingCode: string | null }) =>
      chamar<RespostaDoEnvio>(
        { acao: "enviar", company_id: p.companyId, mensagem: p.mensagem, pagina: p.pagina, booking_code: p.bookingCode },
        "Não consegui falar com a Mia agora.",
      ),
  });
}

export function useNovaConversa() {
  return useMutation({
    mutationFn: (companyId: string) =>
      chamar<{ ok: boolean }>({ acao: "limpar", company_id: companyId }, "Não consegui começar outra conversa."),
  });
}

export function useConfirmarAcao() {
  return useMutation({
    mutationFn: (actionId: string) =>
      chamar<{ status: "executed" | "failed"; resumo: string; pix: { copia_e_cola: string | null; vence_em: string | null } | null }>(
        { acao: "confirmar", action_id: actionId },
        "Não consegui fazer a ação.",
      ),
  });
}

export function useDescartarAcao() {
  return useMutation({
    mutationFn: (actionId: string) => chamar<{ ok: boolean }>({ acao: "descartar", action_id: actionId }, "Não consegui descartar."),
  });
}

export { novoId };
