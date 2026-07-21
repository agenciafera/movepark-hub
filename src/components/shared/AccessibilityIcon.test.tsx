import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccessibilityIcon } from "./AccessibilityIcon";

describe("AccessibilityIcon", () => {
  it("herda a cor do texto, pra funcionar no tema escuro", () => {
    // O arquivo original vinha com `fill="#000000"` cravado, que ficaria invisível
    // no grafite.
    const { container } = render(<AccessibilityIcon />);

    expect(container.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
  });

  it("recebe o tamanho pela classe, como os ícones do lucide", () => {
    // O original vinha em 800x800 fixo.
    const { container } = render(<AccessibilityIcon className="h-4 w-4" />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("width")).toBeNull();
    expect(svg.getAttribute("height")).toBeNull();
    expect(svg.getAttribute("class")).toContain("h-4 w-4");
  });

  it("é decorativo por padrão", () => {
    // Ao lado de um texto que já diz a mesma coisa, o ícone não deve ser lido de novo.
    const { container } = render(<AccessibilityIcon />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("title")).toBeNull();
  });

  it("vira imagem com nome quando recebe `label`", () => {
    render(<AccessibilityIcon label="Vaga acessível" />);

    const svg = screen.getByRole("img", { name: "Vaga acessível" });
    expect(svg.getAttribute("aria-hidden")).toBeNull();
  });

  it("mantém o viewBox original, que é quem centraliza o desenho", () => {
    const { container } = render(<AccessibilityIcon />);

    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("-7.5 0 32 32");
  });
});
