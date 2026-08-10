import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { BlogPost, BlogPostWithDestination } from "@/types/domain";

type BlogPostInsert = Database["public"]["Tables"]["blog_post"]["Insert"];
type BlogPostUpdate = Database["public"]["Tables"]["blog_post"]["Update"];

export const blogKeys = {
  all: ["blog"] as const,
  list: () => [...blogKeys.all, "list"] as const,
  adminList: () => [...blogKeys.all, "admin"] as const,
  detail: (slug: string) => [...blogKeys.all, "detail", slug] as const,
  byDestination: (destinationId: string) =>
    [...blogKeys.all, "destination", destinationId] as const,
};

/**
 * `is_published` é filtrado aqui, na query, e não na RLS.
 *
 * A policy de leitura é `true` de propósito (mesma decisão de `destination`), para
 * o Manager enxergar rascunho pela mesma policy. Quem esquece o filtro aqui vaza
 * rascunho para o público, então ele mora nesta const, num lugar só.
 */
const baseSelect = "*, destination:destination(id, name, short_name, slug)";

/** Público: post publicado por slug (página /blog/<slug>/). */
export function useBlogPost(slug: string | undefined) {
  return useQuery({
    queryKey: slug ? blogKeys.detail(slug) : [...blogKeys.all, "detail", "none"],
    enabled: !!slug,
    queryFn: async (): Promise<BlogPostWithDestination | null> => {
      const { data, error } = await supabase
        .from("blog_post")
        .select(baseSelect)
        .eq("slug", slug!)
        .eq("is_published", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BlogPostWithDestination | null;
    },
    staleTime: 5 * 60_000,
  });
}

/** Público: posts publicados, do mais novo para o mais antigo. */
export function useBlogPosts() {
  return useQuery({
    queryKey: blogKeys.list(),
    queryFn: async (): Promise<BlogPostWithDestination[]> => {
      const { data, error } = await supabase
        .from("blog_post")
        .select(baseSelect)
        .eq("is_published", true)
        .is("deleted_at", null)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BlogPostWithDestination[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Posts de um destino, para o bloco "leia também" da página do post e do destino.
 * Exclui o próprio post quando `exceptSlug` vem preenchido.
 */
export function useRelatedPosts(destinationId: string | null | undefined, exceptSlug?: string) {
  return useQuery({
    queryKey: destinationId
      ? blogKeys.byDestination(destinationId)
      : [...blogKeys.all, "destination", "none"],
    enabled: !!destinationId,
    queryFn: async (): Promise<BlogPost[]> => {
      const { data, error } = await supabase
        .from("blog_post")
        .select("*")
        .eq("destination_id", destinationId!)
        .eq("is_published", true)
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return ((data ?? []) as BlogPost[]).filter((p) => p.slug !== exceptSlug).slice(0, 3);
    },
    staleTime: 5 * 60_000,
  });
}

/** Admin (hub_admin): todos os posts, inclusive rascunho. */
export function useAdminBlogPosts() {
  return useQuery({
    queryKey: blogKeys.adminList(),
    queryFn: async (): Promise<BlogPostWithDestination[]> => {
      const { data, error } = await supabase
        .from("blog_post")
        .select(baseSelect)
        .is("deleted_at", null)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BlogPostWithDestination[];
    },
  });
}

export function useCreateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BlogPostInsert) => {
      const { data, error } = await supabase.from("blog_post").insert(payload).select().single();
      if (error) throw error;
      return data as BlogPost;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogKeys.all }),
  });
}

export function useUpdateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: BlogPostUpdate }) => {
      const { data, error } = await supabase
        .from("blog_post")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as BlogPost;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogKeys.all }),
  });
}

/** Soft delete: o projeto nunca apaga linha de conteúdo. */
export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blog_post")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogKeys.all }),
  });
}
