import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Breadcrumb } from "./Breadcrumb";

function montar(props: Parameters<typeof Breadcrumb>[0]) {
  return render(
    <MemoryRouter>
      <Breadcrumb {...props} />
    </MemoryRouter>,
  );
}

const TRILHA = [
  { label: "Início", to: "/" },
  { label: "Destinos", to: "/destinos" },
  { label: "Viracopos" },
];

describe("Breadcrumb", () => {
  it("é uma lista, com um item por nível", () => {
    montar({ items: TRILHA });
    const trilha = screen.getByRole("navigation", { name: /Trilha/i });
    expect(within(trilha).getAllByRole("listitem")).toHaveLength(3);
  });

  it("os níveis acima são links, e o último é a página atual", () => {
    montar({ items: TRILHA });
    expect(screen.getByRole("link", { name: "Início" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Destinos" })).toHaveAttribute("href", "/destinos");
    expect(screen.queryByRole("link", { name: "Viracopos" })).toBeNull();
    expect(screen.getByText("Viracopos")).toHaveAttribute("aria-current", "page");
  });

  /** Quem lê a tela recebe a estrutura pela lista; ouvir o sinal entre os itens atrapalha. */
  it("o separador não é anunciado", () => {
    const { container } = montar({ items: TRILHA });
    const separadores = [...container.querySelectorAll("[aria-hidden]")];
    expect(separadores).toHaveLength(2);
    expect(separadores.every((s) => s.textContent === "›")).toBe(true);
  });

  /**
   * Dentro da faixa de abertura o fundo é navy, e `text-muted` (#6A6A6A) daria
   * 2.7:1 ali, reprovando o AA. Por isso o tom escuro existe.
   */
  it("no tom escuro a trilha não usa a cor de metadata do fundo claro", () => {
    const { container } = montar({ items: TRILHA, tom: "escuro" });
    const lista = container.querySelector("ol")!;
    expect(lista.className).toContain("text-white/80");
    expect(lista.className).not.toContain("text-muted");
  });
});
