import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { REDES } from "@/lib/redes";
import { FacebookMark, MARCA_DA_REDE } from "./SocialMarks";

describe("SocialMarks", () => {
  it("cobre todas as redes de `REDES`", () => {
    // A fileira da página de contato casa pelo nome. Rede sem marca cai no
    // texto puro, e o buraco só apareceria em produção.
    for (const rede of REDES) {
      expect(MARCA_DA_REDE[rede.nome], `falta a marca de ${rede.nome}`).toBeTypeOf("function");
    }
  });

  it.each(Object.entries(MARCA_DA_REDE))("%s herda a cor do texto", (_nome, Marca) => {
    // Os arquivos vieram com `#292640` cravado, que não acompanha o tema
    // escuro nem pega a cor de um chip colorido.
    const { container } = render(<Marca />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(container.querySelectorAll("[fill]:not(svg)")).toHaveLength(0);
  });

  it.each(Object.entries(MARCA_DA_REDE))("%s recebe o tamanho pela classe", (_nome, Marca) => {
    const { container } = render(<Marca className="h-8 w-8" />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("width")).toBeNull();
    expect(svg.getAttribute("height")).toBeNull();
    expect(svg.getAttribute("class")).toContain("h-8 w-8");
  });

  it.each(Object.entries(MARCA_DA_REDE))("%s é decorativa por padrão", (_nome, Marca) => {
    // Na página elas vão dentro de um link que já tem `aria-label`, então ler
    // a marca de novo repetiria o nome da rede.
    const { container } = render(<Marca />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("title")).toBeNull();
  });

  it("vira imagem com nome quando recebe `label`", () => {
    render(<FacebookMark label="Facebook" />);

    expect(screen.getByRole("img", { name: "Facebook" })).toBeInTheDocument();
  });

  /**
   * O `f` do Facebook vinha como path branco por cima do bloco, enquanto o
   * Instagram e o LinkedIn vazam o glifo. Branco cravado some quando o bloco
   * fica claro (tema escuro) e ignora a cor do fundo. Os três precisam vazar.
   */
  it.each(Object.entries(MARCA_DA_REDE))("%s vaza o glifo, sem path branco", (_nome, Marca) => {
    const { container } = render(<Marca />);
    const paths = container.querySelectorAll("path");

    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute("fill-rule")).toBe("evenodd");
  });
});
