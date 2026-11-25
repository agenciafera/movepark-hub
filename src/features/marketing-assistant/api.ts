import { useMutation, useQueryClient } from "@tanstack/react-query";
import { marketingKeys } from "@/features/marketing/api";
import { supabase } from "@/lib/supabase";
import type { Ferramenta, Pagina, Papel, Proposta } from "./marketingAssistant.logic";

/**
 * O assistente da Automação, pela Edge `marketing-assistant`.
 *
 * O navegador nunca fala com o modelo: a Edge confere o hub_admin, roda o laço com as tools de
 * marketing e devolve a resposta. Executar campanha e mudar a chave geral voltam como proposta, e
 * só o clique em Confirmar executa. Ver docs/specs/assistente-marketing.md.
 */

export type RespostaDoTurno = {
  resposta: string;
  ferramentas: Ferramenta[];
  propostas: Proposta[];
  gravou: boolean;
};

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
  const { data, error } = await supabase.functions.invoke("marketing-assistant", { body });
  if (error) throw new Error(await lerErro(error, padrao));
  return data as T;
}

export function useConversar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { mensagens: Array<{ papel: Papel; texto: string }>; pagina: Pagina }) =>
      chamar<RespostaDoTurno>(
        { mensagens: p.mensagens, pagina: p.pagina },
        "Não consegui falar com o assistente agora.",
      ),
    // O assistente salvou segmento, campanha ou cupom: a tela atrás da bolinha recarrega.
    onSuccess: (r) => {
      if (r.gravou) void qc.invalidateQueries({ queryKey: marketingKeys.all });
    },
  });
}

export function useConfirmarProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { tool: string; args: Record<string, unknown> }) =>
      chamar<{ resultado: unknown }>(
        { acao: "confirmar", tool: p.tool, args: p.args },
        "Não consegui executar agora.",
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}
