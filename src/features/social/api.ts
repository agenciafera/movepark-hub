import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { SocialPost, SocialPostEvent, SocialPostPlacement, SocialPostValidation } from "@/types/domain";

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
    // Recusa por versão velha ("O post mudou desde que você abriu") só se resolve vendo a versão
    // nova: recarregar a fila faz o diálogo mostrar o que está valendo agora.
    onError: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
  });
}

/**
 * Aprovar vale para a versão que a pessoa viu: `p_expected_updated_at` é o `updated_at` do post
 * aberto, exatamente como veio do banco (string, sem passar por Date, para não perder os
 * microssegundos). Se o post mudou depois, a RPC recusa e pede para abrir de novo.
 */
export function useApproveSocialPost() {
  return useSocialRpc<{ p_id: string; p_expected_updated_at: string }>("social_post_approve");
}

export function useRejectSocialPost() {
  return useSocialRpc<{ p_id: string; p_reason: string }>("social_post_reject");
}

export function useRescheduleSocialPost() {
  return useSocialRpc<{ p_id: string; p_at: string }>("social_post_reschedule");
}

/**
 * Onde o post sai (feed, stories ou os dois). Vale para a versão aberta, e um post aprovado volta
 * para aprovação: quem aprovou viu outros lugares. O servidor recusa stories sem as imagens 9:16.
 */
export function useSetSocialPlacements() {
  return useSocialRpc<{ p_id: string; p_placements: SocialPostPlacement[]; p_expected_updated_at: string }>(
    "social_post_set_placements",
  );
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
 * exceto os códigos de 401 e 403, que passam por `CODIGOS_DA_EDGE`; `{ erro: "..." }` é o texto
 * da `social-dispatch` quando a publicação falha (502).
 */
export async function mensagemDaEdge(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    const corpo = (await ctx
      .clone()
      .json()
      .catch(() => null)) as { erros?: string[]; error?: string; erro?: string } | null;
    if (corpo?.erros?.length) return corpo.erros.join(" ");
    if (corpo?.error) return CODIGOS_DA_EDGE.get(corpo.error) ?? corpo.error;
    if (corpo?.erro) return corpo.erro;
  }
  return error instanceof Error ? error.message : "Não deu certo. Tente de novo.";
}

/** O que a `social-dispatch` responde no modo forçado quando dá certo (200). */
export type ResultadoPublicarAgora = {
  /** `stories`: o post já tinha saído no feed, e só os stories saíram agora. */
  acao: "publicado" | "reconciliado" | "outra_rodada" | "stories";
  permalink: string | null;
  /** Os stories desta chamada, quando o post vai para stories. */
  stories: { publicados: number; faltam: number; erro?: string } | null;
};

/**
 * "Publicar agora" (21/10/2026), em duas chamadas:
 *   1. a RPC `social_post_publish_now` confere hub_admin, a versão aberta (`updated_at`, a mesma
 *      regra da aprovação) e os bloqueios, e deixa o post aprovado para agora;
 *   2. a Edge `social-dispatch`, no modo forçado, publica só esse post, com a pega atômica e a
 *      reconciliação de sempre. Ela ignora a chave de disparo e o um por dia.
 * Se a 2 cair no meio (rede), o post fica aprovado para agora e o botão continua lá para tentar
 * de novo: a pega e a consulta do container impedem que ele saia duas vezes. A publicação pode
 * levar até um minuto e meio (o container da Meta precisa ficar pronto).
 */
export function usePublishSocialPostNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      p_id: string;
      p_expected_updated_at: string;
    }): Promise<ResultadoPublicarAgora> => {
      const { error: erroRpc } = await db.rpc("social_post_publish_now", args);
      if (erroRpc) throw erroRpc;
      const { data, error } = await supabase.functions.invoke("social-dispatch", {
        body: { post_id: args.p_id },
      });
      if (error) throw new Error(await mensagemDaEdge(error));
      const r = data as {
        ok?: boolean;
        acao?: string;
        permalink?: string | null;
        stories?: { publicados: number; faltam: number; erro?: string };
        erro?: string;
        error?: string;
      } | null;
      if (
        r?.ok &&
        (r.acao === "publicado" ||
          r.acao === "reconciliado" ||
          r.acao === "outra_rodada" ||
          r.acao === "stories")
      ) {
        return { acao: r.acao, permalink: r.permalink ?? null, stories: r.stories ?? null };
      }
      throw new Error(r?.erro ?? r?.error ?? "A publicação não terminou. Confira a fila.");
    },
    // Nos dois casos o estado do post mudou no servidor: a fila recarrega para mostrar o de agora
    // (o link do post, o erro, ou a versão nova que fez a RPC recusar).
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
    onError: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
  });
}

export function useUpdateSocialCaption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      caption,
      expected_updated_at,
    }: {
      id: string;
      caption: string;
      /** O `updated_at` do post aberto: a Edge só grava se a linha ainda estiver nessa versão. */
      expected_updated_at: string;
    }): Promise<SocialPostValidation> => {
      const { data, error } = await supabase.functions.invoke("social-draft", {
        body: { action: "update_caption", id, caption, expected_updated_at },
      });
      if (error) throw new Error(await mensagemDaEdge(error));
      return (data as { validation: SocialPostValidation }).validation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
    // Mesma razão do `useSocialRpc`: o 409 de versão velha pede para ver a versão nova.
    onError: () => qc.invalidateQueries({ queryKey: socialKeys.all }),
  });
}
