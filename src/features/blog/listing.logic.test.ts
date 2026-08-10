import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  filterPosts,
  pageHref,
  pageSlice,
  pageWindow,
  searchPosts,
  totalPages,
  type ListablePost,
} from "./listing.logic";

function post(over: Partial<ListablePost> & { slug: string }): ListablePost {
  return {
    title: over.slug,
    excerpt: null,
    published_at: "2026-01-01T00:00:00Z",
    category: null,
    author: null,
    destination: null,
    tags: [],
    ...over,
  };
}

describe("paginação", () => {
  it("conta as páginas com a sobra virando uma página inteira", () => {
    expect(totalPages(93)).toBe(8); // 7 cheias + 9 posts
    expect(totalPages(12)).toBe(1);
    expect(totalPages(13)).toBe(2);
  });

  it("nunca devolve zero página, mesmo sem post nenhum", () => {
    // Zero páginas faria a barra sumir e /blog/ virar rota sem alvo.
    expect(totalPages(0)).toBe(1);
  });

  it("fatia a página pedida", () => {
    const itens = Array.from({ length: 30 }, (_, i) => i);
    expect(pageSlice(itens, 1)).toHaveLength(PAGE_SIZE);
    expect(pageSlice(itens, 3)).toEqual([24, 25, 26, 27, 28, 29]);
    expect(pageSlice(itens, 9)).toEqual([]);
    expect(pageSlice(itens, 0)).toEqual([]);
  });

  it("a página 1 é /blog/, não /blog/page/1/", () => {
    // Duas URLs com o mesmo conteúdo é duplicata, e a raiz é a que o Google conhece.
    expect(pageHref(1)).toBe("/blog/");
    expect(pageHref(2)).toBe("/blog/page/2/");
    expect(pageHref(2, "/blog/categoria/precos")).toBe("/blog/categoria/precos/page/2/");
  });

  it("a janela mostra a primeira, a última e as vizinhas, com lacuna no meio", () => {
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});

describe("busca", () => {
  const acervo = [
    post({ slug: "a", title: "Preço do estacionamento em Guarulhos", tags: [{ slug: "economia", name: "Economia" }] }),
    post({ slug: "b", title: "Top 3 de Viracopos", destination: { slug: "vcp", name: "Aeroporto de Viracopos" } }),
    post({ slug: "c", title: "Guia de Guarulhos", tags: [{ slug: "traslado", name: "Traslado" }] }),
  ];

  it("ignora acento e caixa", () => {
    expect(searchPosts(acervo, "PREÇO").map((p) => p.slug)).toEqual(["a"]);
    expect(searchPosts(acervo, "preco").map((p) => p.slug)).toEqual(["a"]);
  });

  it("exige todos os termos, não qualquer um", () => {
    // Com OU, "preço guarulhos" devolveria quase o acervo inteiro.
    expect(searchPosts(acervo, "preço guarulhos").map((p) => p.slug)).toEqual(["a"]);
    expect(searchPosts(acervo, "guarulhos").map((p) => p.slug)).toEqual(["a", "c"]);
  });

  it("acha pelo nome da tag e do aeroporto, não só pelo título", () => {
    expect(searchPosts(acervo, "traslado").map((p) => p.slug)).toEqual(["c"]);
    expect(searchPosts(acervo, "viracopos").map((p) => p.slug)).toEqual(["b"]);
  });

  it("busca vazia devolve tudo", () => {
    expect(searchPosts(acervo, "   ")).toHaveLength(3);
  });
});

describe("filtro por taxonomia", () => {
  const acervo = [
    post({ slug: "a", category: { slug: "precos", name: "Preços" }, author: { slug: "diego", name: "Diego" } }),
    post({ slug: "b", category: { slug: "guias", name: "Guias" }, tags: [{ slug: "valet", name: "Valet" }] }),
    post({ slug: "c", destination: { slug: "cgh", name: "Congonhas" }, author: { slug: "diego", name: "Diego" } }),
  ];

  it("filtra por cada eixo", () => {
    expect(filterPosts(acervo, { categoria: "precos" }).map((p) => p.slug)).toEqual(["a"]);
    expect(filterPosts(acervo, { tag: "valet" }).map((p) => p.slug)).toEqual(["b"]);
    expect(filterPosts(acervo, { autor: "diego" }).map((p) => p.slug)).toEqual(["a", "c"]);
    expect(filterPosts(acervo, { aeroporto: "cgh" }).map((p) => p.slug)).toEqual(["c"]);
  });

  it("eixos combinados se acumulam", () => {
    expect(filterPosts(acervo, { autor: "diego", categoria: "precos" }).map((p) => p.slug)).toEqual([
      "a",
    ]);
  });

  it("filtro vazio não mexe na lista", () => {
    expect(filterPosts(acervo, {})).toHaveLength(3);
  });
});
