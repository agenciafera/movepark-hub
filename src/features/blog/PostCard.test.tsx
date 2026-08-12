import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FeaturedPostCard, PostCard } from "./PostCard";
import type { BlogPostListItem } from "@/types/domain";

const POST = {
  id: "post-1",
  slug: "estacionamento-viracopos",
  title: "Estacionamento em Viracopos",
  excerpt: "O que olhar antes de reservar.",
  cover_image_url: "/blog/capa.webp",
  published_at: "2026-04-06T12:00:00Z",
  destination: { id: "d1", name: "Viracopos", short_name: "VCP", slug: "viracopos" },
  category: { id: "c1", name: "Comparativos", slug: "comparativos" },
  author: { id: "a1", name: "Peu", slug: "peu" },
  tags: [],
} as unknown as BlogPostListItem;

function montar(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/**
 * A listagem eram doze cards do mesmo tamanho: uma página onde nada é mais
 * importante que nada não tem ponto de entrada.
 */
describe("hierarquia da listagem", () => {
  it("o destaque tem manchete maior que a do card de arquivo", () => {
    const { unmount } = montar(<FeaturedPostCard post={POST} />);
    const destaque = screen.getByRole("heading", { level: 2 });
    expect(destaque.className).toContain("text-display-xl");
    unmount();

    montar(<PostCard post={POST} />);
    expect(screen.getByRole("heading", { level: 2 }).className).toContain("text-display-sm");
  });

  /**
   * Doze molduras iguais na tela viram grade de caixas, não lista de leitura. A
   * capa, o título e o resumo delimitam o item sozinhos.
   */
  it("o card não tem moldura em volta", () => {
    const { container } = montar(<PostCard post={POST} />);
    const card = container.querySelector("article")!;
    expect(card.className).not.toContain("border");
    expect(card.className).not.toContain("bg-canvas");
  });

  /** Card de arquivo corta o resumo; o destaque mostra inteiro. */
  it("só o card de arquivo corta o resumo em três linhas", () => {
    const { container, unmount } = montar(<PostCard post={POST} />);
    expect(container.querySelector(".line-clamp-3")).not.toBeNull();
    unmount();

    const destaque = montar(<FeaturedPostCard post={POST} />);
    expect(destaque.container.querySelector(".line-clamp-3")).toBeNull();
  });
});

/**
 * Categoria e destino viviam na linha da data, com o mesmo peso dela: era preciso
 * ler para descobrir do que o post tratava.
 */
describe("eyebrow do card", () => {
  it("mostra a categoria como rótulo, com a cor de eyebrow do contrato", () => {
    const { container } = montar(<PostCard post={POST} />);
    const eyebrow = screen.getByText("Comparativos");
    expect(eyebrow.className).toContain("uppercase");
    expect(eyebrow.className).toContain("text-mp-indigo");
    // Violeta é reservado a elemento acionável; o eyebrow não é clicável.
    expect(container.querySelector(".text-mp-primary")).toBeNull();
  });

  it("sem categoria, o destino assume o rótulo", () => {
    montar(<PostCard post={{ ...POST, category: null }} />);
    expect(screen.getByText("Viracopos").className).toContain("uppercase");
  });

  it("sem categoria e sem destino, nenhum rótulo é inventado", () => {
    const { container } = montar(
      <PostCard post={{ ...POST, category: null, destination: null }} />,
    );
    expect(container.querySelector(".uppercase")).toBeNull();
  });
});

/** Post é assinado por gente, e o rosto separa a assinatura de mais um metadado. */
describe("assinatura do card", () => {
  it("usa a foto do autor quando existe", () => {
    const comFoto = { ...POST, author: { ...POST.author!, avatar_url: "/autores/peu.webp" } };
    const { container } = montar(<PostCard post={comFoto} />);
    const avatar = container.querySelector('img[src="/autores/peu.webp"]');
    expect(avatar).not.toBeNull();
    // Decorativo: o nome vem no texto ao lado, e alt repetido duplica a leitura.
    expect(avatar).toHaveAttribute("alt", "");
  });

  it("sem foto, cai nas iniciais do mesmo helper da topbar", () => {
    montar(<PostCard post={POST} />);
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("post sem autor não inventa avatar", () => {
    const { container } = montar(<PostCard post={{ ...POST, author: null }} />);
    expect(container.querySelector("img.rounded-full")).toBeNull();
    expect(screen.getByText("06/04/2026")).toBeInTheDocument();
  });
});
