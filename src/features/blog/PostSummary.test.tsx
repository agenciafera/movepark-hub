import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostSummary } from "./PostSummary";
import { PostBody } from "./PostBody";
import { sectionsFrom } from "./markdown.logic";
import { MemoryRouter } from "react-router-dom";

const CORPO = [
  "Abertura do post.",
  "## 1. Evolução de Viracopos",
  "Texto da primeira seção.",
  "## 2. Comparativo de preços",
  "Texto da segunda seção.",
  "### Subtítulo que não entra no índice",
  "Mais texto.",
].join("\n\n");

describe("PostSummary", () => {
  it("com resumo escrito, mostra o resumo e não o índice", async () => {
    render(<PostSummary resumo="Comparamos cinco lotes de Viracopos." bodyMd={CORPO} />);
    await userEvent.click(screen.getByRole("button", { name: /Ver resumo/ }));
    expect(screen.getByText("Comparamos cinco lotes de Viracopos.")).toBeVisible();
    expect(screen.queryByText("1. Evolução de Viracopos")).toBeNull();
  });

  it("sem resumo, cai no índice das seções, só com os h2", async () => {
    render(<PostSummary resumo={null} bodyMd={CORPO} />);
    await userEvent.click(screen.getByRole("button", { name: /Nesta página/ }));
    expect(screen.getByRole("link", { name: "1. Evolução de Viracopos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2. Comparativo de preços" })).toBeInTheDocument();
    expect(screen.queryByText("Subtítulo que não entra no índice")).toBeNull();
  });

  /** Aberto por padrão, empurra o primeiro parágrafo para fora da tela. */
  it("nasce fechado", () => {
    render(<PostSummary resumo={null} bodyMd={CORPO} />);
    expect(screen.getByRole("button", { name: /Nesta página/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("índice de uma seção só não vira bloco", () => {
    const { container } = render(<PostSummary resumo={null} bodyMd={"## Única\n\nTexto."} />);
    expect(container.firstChild).toBeNull();
  });
});

/**
 * As âncoras do índice e os ids dos títulos são contados nos dois lados. Se um
 * mudar de critério, o índice passa a apontar para o nada.
 */
describe("âncoras das seções", () => {
  it("todo item do índice acha o título correspondente no corpo", () => {
    const { container } = render(
      <MemoryRouter>
        <PostBody markdown={CORPO} />
      </MemoryRouter>,
    );
    const secoes = sectionsFrom(CORPO);
    expect(secoes).toHaveLength(2);
    for (const s of secoes) {
      expect(container.querySelector(`h2#${CSS.escape(s.id)}`)).not.toBeNull();
    }
  });

  /**
   * Id começando com dígito é HTML válido e seletor CSS inválido, e título de
   * guia quase sempre começa com número.
   */
  it("o id nunca começa com dígito", () => {
    for (const s of sectionsFrom(CORPO)) {
      expect(s.id).toMatch(/^secao-/);
    }
  });

  /** Dois ids iguais fazem a âncora cair sempre no primeiro. */
  it("título repetido no post ainda gera âncoras distintas", () => {
    const ids = sectionsFrom("## Conclusão\n\na\n\n## Conclusão\n\nb").map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
  });
});
