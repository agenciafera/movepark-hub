import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import BlogPostPage from "@/routes/blog-post";
import type { BlogPostWithDestination } from "@/types/domain";

const POST = {
  id: "post-1",
  slug: "estacionamento-viracopos",
  title: "Estacionamento em Viracopos",
  body_md: "Primeiro parágrafo do post.\n\n## Uma seção\n\nSegundo parágrafo.",
  excerpt: "Resumo",
  meta_title: null,
  meta_description: null,
  cover_image_url: "/blog/capa.webp",
  published_at: "2026-04-06T12:00:00Z",
  updated_at: "2026-04-06T12:00:00Z",
  author_name: "Peu",
  destination_id: "dest-1",
  destination: { id: "dest-1", name: "Viracopos", short_name: "VCP", slug: "viracopos" },
  category: { id: "cat-1", name: "Comparativos", slug: "comparativos" },
  author: { id: "aut-1", name: "Peu", slug: "peu" },
  tags: [{ id: "tag-1", name: "Campinas", slug: "campinas" }],
} as unknown as BlogPostWithDestination;

function renderPost() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: "/blog/:slug", element: <BlogPostPage />, loader: () => POST }],
    { initialEntries: [`/blog/${POST.slug}`] },
  );
  return render(
    <QueryClientProvider client={qc}>
      <HelmetProvider>
        <RouterProvider router={router} />
      </HelmetProvider>
    </QueryClientProvider>,
  );
}

/**
 * O post ficava inteiro em 720px, o que no desktop dava 656px de texto e uma capa
 * do mesmo tamanho. Agora o container é o de conteúdo (1080) e só a prosa fica
 * presa na medida de leitura.
 */
describe("BlogPostPage: largura", () => {
  it("o container do post é o de conteúdo (1080), não o de leitura (720)", async () => {
    const { container } = renderPost();
    const article = await waitForArticle(container);
    expect(article.className).toContain("max-w-[1080px]");
    expect(article.className).not.toContain("max-w-[720px]");
  });

  it("a prosa continua presa na medida de leitura de 68ch", async () => {
    const { container } = renderPost();
    const article = await waitForArticle(container);
    const corpo = article.querySelector("h1")!.closest("div[class*='max-w-[68ch]']");
    expect(corpo).not.toBeNull();
    const paragrafo = [...article.querySelectorAll("p")].find((p) =>
      p.textContent?.includes("Primeiro parágrafo"),
    )!;
    expect(paragrafo.closest("div[class*='max-w-[68ch]']")).not.toBeNull();
  });

  /**
   * A capa é banner com a manchete gravada dentro: ela ganha em ser maior. O
   * `[sizes]` distingue a capa do fundo desfocado, que o `CoverImage` renderiza
   * como um segundo `<img>` sem `srcset`.
   */
  it("a capa sai da coluna de leitura e usa o container inteiro", async () => {
    const { container } = renderPost();
    const article = await waitForArticle(container);
    const capa = article.querySelector<HTMLImageElement>("img[sizes]")!;
    expect(capa).not.toBeNull();
    expect(capa.closest("div[class*='max-w-[68ch]']")).toBeNull();
    expect(capa.getAttribute("sizes")).toContain("1016px");
  });
});

/** O RouterProvider resolve o loader num tick; o artigo só existe depois dele. */
async function waitForArticle(container: HTMLElement) {
  const { waitFor } = await import("@testing-library/react");
  return waitFor(() => {
    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    return article!;
  });
}
