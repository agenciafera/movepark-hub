import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { SocialPost, SocialPostEvent, SocialPostValidation } from "@/types/domain";

/**
 * Fila de publicação do Instagram (E3.6). A tela lê a fila e o rastro, e decide pelas RPCs
 * `social_post_*`, que conferem hub_admin no servidor. A correção de legenda vai pela Edge
 * `social-draft`, porque é lá que a conferência roda.
 *
 * Spec: docs/specs/instagram-fila-de-publicacao.md
 */

/**
 * `social_post`, `social_post_event` e as RPCs não passam pelo tipo gerado: o `supabase gen
 * types` vem derrubando tabelas e funções que existem no banco (ver features/payouts/api.ts).
 * O cliente sem tipo fica neste arquivo só, e os tipos da tela são os curados em `@/types/domain`.
 */
const db = supabase as unknown as SupabaseClient;

export const socialKeys = {
  all: ["social"] as const,
  list: () => [...socialKeys.all, "list"] as const,
  events: (id: string) => [...socialKeys.all, "events", id] as const,
};

async function fetchPosts(): Promise<SocialPost[]> {
  const { data, error } = await db
    .from("social_post")
    .select("*")
    .is("deleted_at", null)
    .neq("status", "rejected")
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SocialPost[];
}

export function useSocialPosts() {
  return useQuery({ queryKey: socialKeys.list(), queryFn: fetchPosts });
}

export function useSocialPostEvents(id: string | null) {
  return useQuery({
    queryKey: socialKeys.events(id ?? ""),
    enabled: Boolean(id),
    queryFn: async (): Promise<SocialPostEvent[]> => {
      const { data, error } = await db
        .from("social_post_event")
        .select("*")
        .eq("social_post_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SocialPostEvent[];
    },
  });
}

function useSocialRpc<T extends Record<string, unknown>>(fn: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: T) => {
      const { error } = await db.rpc(fn, args);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
  });
}

export function useApproveSocialPost() {
  return useSocialRpc<{ p_id: string }>("social_post_approve");
}

export function useRejectSocialPost() {
  return useSocialRpc<{ p_id: string; p_reason: string }>("social_post_reject");
}

export function useRescheduleSocialPost() {
  return useSocialRpc<{ p_id: string; p_at: string }>("social_post_reschedule");
}

/**
 * Códigos de máquina que a Edge `social-draft` devolve em inglês (`{ error: "unauthorized" }`
 * com 401, `{ error: "forbidden" }` com 403). Trocados aqui, para não chegarem crus à tela.
 */
const CODIGOS_DA_EDGE = new Map<string, string>([
  ["unauthorized", "Sua sessão expirou. Entre de novo para continuar."],
  ["forbidden", "Só a equipe da Movepark pode corrigir a legenda."],
]);

/**
 * `functions.invoke` devolve só a mensagem genérica ("Edge Function returned a non-2xx status
 * code") e guarda o `Response` em `error.context`. Aqui lemos o corpo da Edge: `{ erros: [...] }`
 * (422) traz a lista de validação em pt-BR; `{ error: "..." }` traz um texto em pt-BR (404, 500),
 * exceto os códigos de 401 e 403, que passam por `CODIGOS_DA_EDGE`.
 */
export async function mensagemDaEdge(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    const corpo = (await ctx
      .clone()
      .json()
      .catch(() => null)) as { erros?: string[]; error?: string } | null;
    if (corpo?.erros?.length) return corpo.erros.join(" ");
    if (corpo?.error) return CODIGOS_DA_EDGE.get(corpo.error) ?? corpo.error;
  }
  return error instanceof Error ? error.message : "Não deu certo. Tente de novo.";
}

export function useUpdateSocialCaption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      caption,
    }: {
      id: string;
      caption: string;
    }): Promise<SocialPostValidation> => {
      const { data, error } = await supabase.functions.invoke("social-draft", {
        body: { action: "update_caption", id, caption },
      });
      if (error) throw new Error(await mensagemDaEdge(error));
      return (data as { validation: SocialPostValidation }).validation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
  });
}
