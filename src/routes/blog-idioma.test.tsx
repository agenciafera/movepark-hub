import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";

import { renderWithProviders } from "@/test/utils";

import BlogIndiceIdiomaPage, {
  paginaDoCaminho,
  type BlogIndiceIdiomaData,
} from "@/routes/blog-idioma";
import type { PostTraduzidoNaLista } from "@/features/blog/i18nApi";
import { caminhoDoIndice } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

function post(n: number): PostTraduzidoNaLista {
  return {
    id: `id-${n}`,
    slug: `parking-post-${n}`,
    title: `Parking post ${n}`,
    excerpt: `Resumo ${n}`,
    cover_image_url: null,
    published_at: `2026-09-${String(10 + n).padStart(2, "0")}T12:00:00+00:00`,
    destination: { name: "Aeroporto de Guarulhos", slug: "aeroporto-guarulhos" },
  };
}

function setup(dados: Partial<BlogIndiceIdiomaData> & { locale?: "en" | "es" } = {}) {
  const locale = dados.locale ?? "en";
  const posts = dados.posts ?? [post(1), post(2), post(3)];
  const page = dados.page ?? 1;
  const rota = page > 1 ? `/${locale}/blog/page/${page}` : `/${locale}/blog`;
  // `renderWithProviders` porque a página lê o acervo do idioma por `useQuery`, e sem o
  // QueryClientProvider o componente estoura antes de renderizar.
  return renderWithProviders(
    <HelmetProvider>
      <BlogIndiceIdiomaPage />
    </HelmetProvider>,
    { route: rota, path: rota, loader: () => ({ locale, posts, page, total: dados.total ?? 1 }) },
  );
}

describe("índice do blog traduzido", () => {
  it("lista os posts do idioma e aponta cada um para a URL daquele idioma", async () => {
    setup();
    const link = await screen.findByRole("link", { name: "Parking post 2" });
    // O defeito que isto tranca: o card montava `/blog/<slug>` fixo, então a listagem
    // em inglês levava para uma URL portuguesa que não existe com o slug inglês.
    expect(link).toHaveAttribute("href", "/en/blog/parking-post-2");
  });

  it("a casca sai no idioma da rota, não em português", async () => {
    setup({ locale: "es" });
    expect(await screen.findByPlaceholderText("Buscar en el blog")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Buscar no blog")).toBeNull();
  });

  it("diz que a lista é menor que a portuguesa, e leva ao arquivo completo", async () => {
    setup();
    const arquivo = await screen.findByRole("link", { name: /Full archive/i });
    expect(arquivo).toHaveAttribute("href", "/blog/");
  });

  it("sem post traduzido mostra o estado vazio, e não uma lista em português", async () => {
    setup({ posts: [] });
    expect(await screen.findByText("No posts published yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Parking post/ })).toBeNull();
  });

  it("o destaque é o primeiro, e ele NÃO se repete na grade", async () => {
    setup();
    await screen.findByRole("link", { name: "Parking post 2" });
    expect(screen.getAllByRole("link", { name: "Parking post 1" }).length).toBeLessThanOrEqual(2);
    expect(screen.getAllByRole("link", { name: "Parking post 2" })).toHaveLength(1);
  });
});

describe("paginaDoCaminho", () => {
  it("lê a página da URL, com 1 como padrão", () => {
    expect(paginaDoCaminho("/en/blog")).toBe(1);
    expect(paginaDoCaminho("/en/blog/page/2")).toBe(2);
    expect(paginaDoCaminho("/es/blog/page/7/")).toBe(7);
  });

  it("página inválida cai em 1 em vez de virar NaN", () => {
    expect(paginaDoCaminho("/en/blog/page/abc")).toBe(1);
    expect(paginaDoCaminho("/en/blog/page")).toBe(1);
    expect(paginaDoCaminho("/en/blog/page/0")).toBe(1);
  });
});

describe("a base da paginação usa o caminho do idioma", () => {
  it("não monta `/blog/page/2` dentro do inglês", () => {
    // A base vem de `caminhoDoIndice`, então a página 2 do inglês é `/en/blog/page/2`.
    expect(`${caminhoDoIndice("blog", "en")}/page/2`).toBe("/en/blog/page/2");
    expect(`${caminhoDoIndice("blog", "es")}/page/2`).toBe("/es/blog/page/2");
  });
});

describe("contrato de URL do índice traduzido", () => {
  /**
   * O defeito real do build de 30/09/2026: `pageHref` devolve `/en/blog/` na página 1,
   * porque a barra é o contrato do português. Nos idiomas traduzidos o worker 301 essa
   * barra, então a canônica apontava para uma URL que redireciona, enquanto a
   * auto-referência do `hreflang` na mesma página apontava para a forma sem barra.
   */
  it("a canônica da página 1 é a própria rota, SEM barra final", async () => {
    const { container } = setup();
    await screen.findByRole("link", { name: "Parking post 2" });
    const canonical = container.ownerDocument.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute("href")).toBe(`${SITE_URL}/en/blog`);
  });

  it("a auto-referência do hreflang bate com a canônica, string por string", async () => {
    const { container } = setup();
    await screen.findByRole("link", { name: "Parking post 2" });
    const doc = container.ownerDocument;
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
    const auto = doc.querySelector('link[hreflang="en"]')?.getAttribute("href");
    expect(auto).toBe(canonical);
  });

  it("o cluster traz os três idiomas mais o x-default no português", async () => {
    const { container } = setup();
    await screen.findByRole("link", { name: "Parking post 2" });
    const doc = container.ownerDocument;
    const cluster = [...doc.querySelectorAll("link[hreflang]")].map((l) => [
      l.getAttribute("hreflang"),
      l.getAttribute("href"),
    ]);
    expect(cluster).toEqual([
      ["pt-BR", `${SITE_URL}/blog/`],
      ["en", `${SITE_URL}/en/blog`],
      ["es", `${SITE_URL}/es/blog`],
      ["x-default", `${SITE_URL}/blog/`],
    ]);
  });
});

describe("paginação do índice traduzido", () => {
  /**
   * O defeito que o `audit-structured-data` pegou no build de 30/09/2026: o loader já
   * entrega a FATIA daquela página, e o componente fatiava de novo. Em `/en/blog/page/2`
   * isso é `pageSlice(6 itens, página 2)`, que é vazio: a página saía sem card nenhum e
   * com um `ItemList` sem `itemListElement`.
   */
  it("a página 2 mostra o que o loader entregou, sem fatiar de novo", async () => {
    setup({ page: 2, total: 2, posts: [post(7), post(8)] });
    expect(await screen.findByRole("link", { name: "Parking post 7" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Parking post 8" })).toBeInTheDocument();
  });

  it("sem post, nenhum ItemList é emitido", async () => {
    const { container } = setup({ posts: [] });
    await screen.findByText("No posts published yet.");
    const listas = [...container.ownerDocument.querySelectorAll('script[type="application/ld+json"]')]
      .map((n) => JSON.parse(n.textContent || "{}"))
      .filter((j) => j["@type"] === "ItemList");
    expect(listas).toEqual([]);
  });
});
