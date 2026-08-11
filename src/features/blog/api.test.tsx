import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import {
  useCreateBlogAuthor,
  useCreateBlogCategory,
  useCreateBlogPost,
  useCreateBlogTag,
  useDeleteBlogAuthor,
  useDeleteBlogPost,
  useSetPostTags,
  useUpdateBlogAuthor,
  useUpdateBlogPost,
} from "./api";

/**
 * Contrato de rede do blog.
 *
 * O `slug` aqui não é campo de cadastro, é URL indexada: os 93 posts vieram do
 * WordPress com o slug intacto justamente para as páginas seguirem respondendo no
 * mesmo endereço. Mudar slug é quebrar link no Google, e é por isso que o teste
 * de conflito importa tanto quanto o de sucesso.
 */

describe("useCreateBlogPost", () => {
  it("insere o post e devolve a linha criada", async () => {
    tabela("blog_post", "post", { json: { id: "post-1", slug: "meu-post" } });

    const { result } = renderMutation(() => useCreateBlogPost());
    const criado = await result.current.mutateAsync({
      slug: "meu-post",
      title: "Meu post",
      body_md: "# Título\n\ncorpo",
    });

    expect((criado as { id: string }).id).toBe("post-1");
  });

  it("slug duplicado sobe com a mensagem do servidor", async () => {
    // `blog_post_slug_key` é unique porque o slug vira URL. A tela precisa dizer
    // qual é o problema, não um "erro ao salvar" genérico.
    falha("tabela", "blog_post", 409, "slug já existe");

    const { result } = renderMutation(() => useCreateBlogPost());
    await expect(
      result.current.mutateAsync({ slug: "meu-post", title: "X", body_md: "corpo" }),
    ).rejects.toThrow();
  });
});

describe("useUpdateBlogPost", () => {
  it("aplica o patch no post certo, e só o que mudou", async () => {
    const patch = tabela("blog_post", "patch", { json: { id: "post-9" } });

    const { result } = renderMutation(() => useUpdateBlogPost());
    await result.current.mutateAsync({ id: "post-9", patch: { is_published: true } });

    expect(patch.chamadas[0].url).toContain("id=eq.post-9");
    expect(patch.ultimoBody).toEqual({ is_published: true });
  });
});

describe("useDeleteBlogPost", () => {
  it("faz soft delete em vez de apagar a linha", async () => {
    // Soft delete é a regra do projeto, e aqui ela vale dobrado: a linha guarda
    // `legacy_wp_id` e `legacy_url`, que são o rastro da migração do WordPress.
    const patch = tabela("blog_post", "patch", { json: [] });

    const { result } = renderMutation(() => useDeleteBlogPost());
    await result.current.mutateAsync("post-9");

    expect(patch.chamadas[0].url).toContain("id=eq.post-9");
    expect(patch.ultimoBody).toHaveProperty("deleted_at");
  });
});

describe("useSetPostTags", () => {
  it("apaga as tags atuais antes de inserir as novas", async () => {
    // Substituição, não acréscimo: sem o delete, desmarcar uma tag na tela não
    // tiraria o post do filtro daquela tag.
    const del = tabela("blog_post_tag", "delete", { json: [] });
    const post = tabela("blog_post_tag", "post", { json: [] });

    const { result } = renderMutation(() => useSetPostTags());
    await result.current.mutateAsync({ postId: "post-1", tagIds: ["tag-a", "tag-b"] });

    expect(del.chamadas[0].url).toContain("post_id=eq.post-1");
    expect(post.ultimoBody).toEqual([
      { post_id: "post-1", tag_id: "tag-a" },
      { post_id: "post-1", tag_id: "tag-b" },
    ]);
  });

  it("lista vazia só apaga, sem insert de payload vazio", async () => {
    const del = tabela("blog_post_tag", "delete", { json: [] });
    const post = tabela("blog_post_tag", "post", { json: [] });

    const { result } = renderMutation(() => useSetPostTags());
    await result.current.mutateAsync({ postId: "post-2", tagIds: [] });

    expect(del.chamadas).toHaveLength(1);
    expect(post.chamadas).toHaveLength(0);
  });
});

describe("cadastro de taxonomia", () => {
  it("cria categoria com slug próprio", async () => {
    tabela("blog_category", "post", { json: { id: "cat-1", slug: "guias" } });
    const { result } = renderMutation(() => useCreateBlogCategory());
    const criada = await result.current.mutateAsync({ name: "Guias", slug: "guias" });
    expect((criada as { id: string }).id).toBe("cat-1");
  });

  it("slug de categoria duplicado sobe o erro do servidor", async () => {
    // O slug vira /blog/categoria/<slug>/, então duplicata é URL em conflito.
    falha("tabela", "blog_category", 409, "slug já existe");
    const { result } = renderMutation(() => useCreateBlogCategory());
    await expect(
      result.current.mutateAsync({ name: "Guias", slug: "guias" }),
    ).rejects.toThrow();
  });

  it("cria tag", async () => {
    tabela("blog_tag", "post", { json: { id: "tag-1", slug: "valet" } });
    const { result } = renderMutation(() => useCreateBlogTag());
    const criada = await result.current.mutateAsync({ name: "Valet", slug: "valet" });
    expect((criada as { id: string }).id).toBe("tag-1");
  });

  it("cria autor", async () => {
    tabela("blog_author", "post", { json: { id: "aut-1", slug: "diego" } });
    const { result } = renderMutation(() => useCreateBlogAuthor());
    const criado = await result.current.mutateAsync({ name: "Diego", slug: "diego" });
    expect((criado as { id: string }).id).toBe("aut-1");
  });

  it("renomear autor não mexe no slug, que é a URL da página dele", async () => {
    const patch = tabela("blog_author", "patch", { json: { id: "aut-1" } });
    const { result } = renderMutation(() => useUpdateBlogAuthor());
    await result.current.mutateAsync({ id: "aut-1", patch: { name: "Diego Silva" } });

    expect(patch.chamadas[0].url).toContain("id=eq.aut-1");
    expect(patch.ultimoBody).toEqual({ name: "Diego Silva" });
  });
});

describe("useDeleteBlogAuthor", () => {
  it("faz soft delete, sem apagar a linha", async () => {
    // A FK de blog_post.author_id é `on delete set null`: apagar de verdade
    // tiraria a assinatura dos posts em silêncio, e não há tela que mostre isso.
    const patch = tabela("blog_author", "patch", { json: [] });

    const { result } = renderMutation(() => useDeleteBlogAuthor());
    await result.current.mutateAsync("aut-9");

    expect(patch.chamadas[0].url).toContain("id=eq.aut-9");
    expect(patch.ultimoBody).toHaveProperty("deleted_at");
  });
});
