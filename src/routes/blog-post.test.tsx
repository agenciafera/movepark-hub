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

function renderPost(overrides?: Partial<BlogPostWithDestination>) {
  const post = { ...POST, ...overrides };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: "/blog/:slug", element: <BlogPostPage />, loader: () => post }],
    { initialEntries: [`/blog/${post.slug}`] },
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

  /**
   * Com lateral quem limita a medida é a coluna da grade; sem lateral o
   * parágrafo se esticaria pelos 1016px do container, então o `max-w` volta.
   */
  it("sem lateral, a prosa volta a ser presa na medida de leitura de 68ch", async () => {
    const { container } = renderPost({ destination: null, destination_id: null });
    const article = await waitForArticle(container);
    expect(article.querySelector("aside")).toBeNull();
    const paragrafo = paragrafoDoCorpo(article);
    expect(paragrafo.closest("div[class*='max-w-[68ch]']")).not.toBeNull();
  });

  it("com lateral, a prosa divide a linha da grade com ela", async () => {
    const { container } = renderPost();
    const article = await waitForArticle(container);
    expect(article.querySelector("aside")).not.toBeNull();
    const grade = article.querySelector("aside")!.parentElement!;
    expect(grade.className).toContain("desktop:grid-cols-[minmax(0,1fr)_300px]");
    expect(grade.contains(paragrafoDoCorpo(article))).toBe(true);
  });
});

function paragrafoDoCorpo(article: Element) {
  return [...article.querySelectorAll("p")].find((p) =>
    p.textContent?.includes("Primeiro parágrafo"),
  )!;
}

/**
 * Empilhado, a capa era uma faixa de 520px entre a manchete e a primeira linha do
 * texto: o leitor via título e imagem, rolava, e só então descobria do que o post
 * tratava.
 */
describe("BlogPostPage: cabeçalho", () => {
  it("título e capa dividem a mesma grade de duas colunas", async () => {
    const { container } = renderPost();
    const article = await waitForArticle(container);
    const cabecalho = article.querySelector("h1")!.closest("div.grid")!;
    expect(cabecalho).not.toBeNull();
    expect(cabecalho.className).toContain("desktop:grid-cols-");
    // O `[sizes]` distingue a capa do fundo desfocado, que o `CoverImage`
    // renderiza como um segundo `<img>` sem `srcset`.
    const capa = cabecalho.querySelector<HTMLImageElement>("img[sizes]")!;
    expect(capa).not.toBeNull();
    expect(capa.getAttribute("sizes")).toContain("512px");
  });

  /** No mobile a ordem do DOM manda: título antes da capa. */
  it("a capa só vai para a esquerda quando há duas colunas", async () => {
    const { container } = renderPost();
    const article = await waitForArticle(container);
    const capa = article.querySelector<HTMLImageElement>("img[sizes]")!;
    const caixa = capa.closest("div[class*='order-first']");
    expect(caixa).not.toBeNull();
    expect(caixa!.className).toContain("desktop:order-first");
  });

  /** O resumo já existia no banco e não aparecia em lugar nenhum da página. */
  it("o resumo do post entra como lead abaixo do título", async () => {
    const { container } = renderPost();
    const article = await waitForArticle(container);
    const lead = [...article.querySelectorAll("p")].find((p) => p.textContent === "Resumo");
    expect(lead).toBeDefined();
    expect(lead!.className).toContain("text-body-md");
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
