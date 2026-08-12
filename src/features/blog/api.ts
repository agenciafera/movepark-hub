import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type {
  BlogAuthor,
  BlogPostListItem,
  BlogCategory,
  BlogPost,
  BlogPostWithDestination,
  BlogTag,
} from "@/types/domain";

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
const baseSelect =
  "*, destination:destination(id, name, short_name, slug)," +
  " category:blog_category(id, name, slug)," +
  " author:blog_author(id, name, slug, avatar_url)," +
  " tags:blog_post_tag(tag:blog_tag(id, name, slug))";

/**
 * O PostgREST devolve a N:N aninhada (`{ tag: {...} }`). Achata para `tags: [...]`,
 * que é o formato que o tipo de domínio e as telas usam.
 */
// deno-lint-ignore no-explicit-any
function flattenTags(rows: any[]): any[] {
  return rows.map((row) => ({
    ...row,
    tags: (row.tags ?? []).map((t: { tag: unknown }) => t.tag).filter(Boolean),
  }));
}

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
      return (data ? flattenTags([data])[0] : null) as BlogPostWithDestination | null;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Colunas da listagem. NÃO traz `body_md`.
 *
 * Com `*`, os 93 posts vinham em 593 KB, quase tudo markdown que a listagem nem
 * lê. Sem o corpo são 133 KB, e é esse payload que a busca e a paginação usam
 * inteiro, em memória.
 */
const listSelect =
  "id, slug, title, excerpt, cover_image_url, published_at," +
  " destination:destination(id, name, short_name, slug)," +
  " category:blog_category(id, name, slug)," +
  " author:blog_author(id, name, slug, avatar_url)," +
  " tags:blog_post_tag(tag:blog_tag(id, name, slug))";

/**
 * Público: o acervo inteiro, enxuto, para a listagem operar em memória.
 *
 * A busca e a paginação filtram e fatiam sobre este resultado, sem ida ao
 * servidor a cada tecla ou a cada página. O TanStack Query segura o cache, então
 * é uma requisição por sessão.
 */
export function useBlogPostList(enabled = true) {
  return useQuery({
    enabled,
    queryKey: [...blogKeys.list(), "light"] as const,
    queryFn: async (): Promise<BlogPostListItem[]> => {
      const { data, error } = await supabase
        .from("blog_post")
        .select(listSelect)
        .eq("is_published", true)
        .is("deleted_at", null)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return flattenTags(data ?? []) as BlogPostListItem[];
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

/**
 * Últimos posts publicados, para a faixa do rodapé da página do post.
 *
 * Consulta própria, com `limit`, em vez de reaproveitar o `useBlogPostList`: o
 * acervo enxuto são 240 KB, e baixar o blog inteiro para mostrar três cards no pé
 * de um artigo é caro para quem chega de busca no 4G. Pede um a mais do que
 * mostra, porque um deles é o post que está aberto.
 */
export function useLatestPosts(exceptSlug?: string, limit = 3) {
  return useQuery({
    queryKey: [...blogKeys.list(), "latest", limit, exceptSlug ?? null] as const,
    queryFn: async (): Promise<BlogPostListItem[]> => {
      const { data, error } = await supabase
        .from("blog_post")
        .select(listSelect)
        .eq("is_published", true)
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(limit + 1);
      if (error) throw error;
      const posts = flattenTags(data ?? []) as BlogPostListItem[];
      return posts.filter((p) => p.slug !== exceptSlug).slice(0, limit);
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
      return flattenTags(data ?? []) as BlogPostWithDestination[];
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

// ── Taxonomia ────────────────────────────────────────────────────────────────

export const blogTaxonomyKeys = {
  categories: ["blog", "categories"] as const,
  tags: ["blog", "tags"] as const,
  authors: ["blog", "authors"] as const,
};

export function useBlogCategories() {
  return useQuery({
    queryKey: blogTaxonomyKeys.categories,
    queryFn: async (): Promise<BlogCategory[]> => {
      const { data, error } = await supabase
        .from("blog_category")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as BlogCategory[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useBlogTags() {
  return useQuery({
    queryKey: blogTaxonomyKeys.tags,
    queryFn: async (): Promise<BlogTag[]> => {
      const { data, error } = await supabase
        .from("blog_tag")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as BlogTag[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useBlogAuthors() {
  return useQuery({
    queryKey: blogTaxonomyKeys.authors,
    queryFn: async (): Promise<BlogAuthor[]> => {
      const { data, error } = await supabase
        .from("blog_author")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as BlogAuthor[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Substitui as tags do post de uma vez: apaga o que saiu, insere o que entrou. */
export function useSetPostTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, tagIds }: { postId: string; tagIds: string[] }) => {
      const { error: delErr } = await supabase.from("blog_post_tag").delete().eq("post_id", postId);
      if (delErr) throw delErr;
      if (!tagIds.length) return;
      const { error } = await supabase
        .from("blog_post_tag")
        .insert(tagIds.map((tag_id) => ({ post_id: postId, tag_id })));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogKeys.all }),
  });
}

export function useCreateBlogCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Database["public"]["Tables"]["blog_category"]["Insert"]) => {
      const { data, error } = await supabase
        .from("blog_category")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as BlogCategory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogTaxonomyKeys.categories }),
  });
}

export function useCreateBlogTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Database["public"]["Tables"]["blog_tag"]["Insert"]) => {
      const { data, error } = await supabase.from("blog_tag").insert(payload).select().single();
      if (error) throw error;
      return data as BlogTag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogTaxonomyKeys.tags }),
  });
}

export function useCreateBlogAuthor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Database["public"]["Tables"]["blog_author"]["Insert"]) => {
      const { data, error } = await supabase.from("blog_author").insert(payload).select().single();
      if (error) throw error;
      return data as BlogAuthor;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogTaxonomyKeys.authors }),
  });
}

/**
 * Soft delete do autor. A checagem de post vinculado fica na tela, que já carrega
 * a lista: a FK é `on delete set null`, então excluir sem checar tiraria a
 * assinatura dos posts em silêncio.
 */
export function useDeleteBlogAuthor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blog_author")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogTaxonomyKeys.authors }),
  });
}

export function useUpdateBlogAuthor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["blog_author"]["Update"];
    }) => {
      const { data, error } = await supabase
        .from("blog_author")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as BlogAuthor;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: blogTaxonomyKeys.authors }),
  });
}
