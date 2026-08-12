import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PostSidebar } from "./PostSidebar";
import type { BlogPost } from "@/types/domain";

const DESTINO = { name: "Aeroporto de Viracopos", slug: "aeroporto-de-viracopos" };

const RELACIONADO = {
  id: "post-2",
  slug: "guia-viracopos",
  title: "Guia completo de Viracopos",
  cover_image_url: "/blog/capa.webp",
  published_at: "2026-03-01T12:00:00Z",
} as unknown as BlogPost;

function montar(props: Parameters<typeof PostSidebar>[0]) {
  return render(
    <MemoryRouter>
      <PostSidebar {...props} />
    </MemoryRouter>,
  );
}

/**
 * CTA e relacionados viviam no rodapé, depois de seis minutos de leitura, que é
 * onde o leitor já foi embora.
 */
describe("PostSidebar", () => {
  it("o CTA do destino aponta para a página que converte", () => {
    montar({ destination: DESTINO, relacionados: [] });
    const cta = screen.getByRole("link", { name: "Ver estacionamentos" });
    expect(cta).toHaveAttribute("href", "/destinos/aeroporto-de-viracopos");
    expect(cta.className).toContain("h-12");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Vai viajar por Aeroporto de Viracopos?",
    );
  });

  it("os relacionados entram como lista de links com data", () => {
    montar({ destination: null, relacionados: [RELACIONADO] });
    const nav = screen.getByRole("navigation", { name: "Leia também" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Guia completo de Viracopos/ })).toHaveAttribute(
      "href",
      "/blog/guia-viracopos/",
    );
    expect(screen.getByText("01/03/2026")).toBeInTheDocument();
  });

  /** Post sem destino no Hub (Navegantes) não inventa CTA. */
  it("sem destino, o CTA não existe", () => {
    montar({ destination: null, relacionados: [RELACIONADO] });
    expect(screen.queryByRole("link", { name: "Ver estacionamentos" })).toBeNull();
  });

  /**
   * `sticky` sem `self-start` não gruda: o item da grade estica até a altura da
   * linha e nunca sobra espaço para rolar dentro dela.
   */
  it("a lateral encolhe ao conteúdo antes de grudar, e tem teto de altura", () => {
    const { container } = montar({ destination: DESTINO, relacionados: [RELACIONADO] });
    const aside = container.querySelector("aside")!;
    expect(aside.className).toContain("desktop:self-start");
    expect(aside.className).toContain("desktop:sticky");
    expect(aside.className).toContain("desktop:max-h-[calc(100dvh-7rem)]");
  });
});
