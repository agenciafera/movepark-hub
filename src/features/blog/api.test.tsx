import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useCreateBlogPost, useDeleteBlogPost, useUpdateBlogPost } from "./api";

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
