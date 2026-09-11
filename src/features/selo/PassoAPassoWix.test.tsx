import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { PassoAPassoWix } from "./PassoAPassoWix";
import { FRASES, gerarSnippet, RAIO, type Fundo } from "./selo.logic";

const FUNDOS: Fundo[] = ["claro", "escuro"];

describe("PassoAPassoWix", () => {
  // O caminho da imagem é montado por interpolação. Uma frase nova no catálogo passaria
  // por typecheck, lint e pelos outros testes, e só quebraria na mão do parceiro, como
  // uma imagem que não carrega.
  it("tem PNG gerado para toda combinação que a página oferece", () => {
    for (const frase of FRASES) {
      for (const fundo of FUNDOS) {
        const caminho = join(
          process.cwd(),
          "public",
          "selo",
          `selo-movepark-${frase.id}-${fundo}.png`,
        );
        expect(existsSync(caminho), `falta ${caminho}. Rode bun run gen:selo`).toBe(true);
      }
    }
  });

  it("aponta para a imagem da combinação escolhida, com o texto do selo no alt", () => {
    render(<PassoAPassoWix frase="reserve" fundo="escuro" />);
    const img = screen.getByAltText("Reserve pela Movepark");
    expect(img).toHaveAttribute("src", "/selo/selo-movepark-reserve-escuro.png");
  });

  // A ficha existe para quem monta o selo à mão no editor do Wix. Se ela e o CSS do
  // snippet saírem de listas diferentes, a instrução envelhece calada.
  it("publica os mesmos valores que o CSS do snippet usa", () => {
    render(<PassoAPassoWix frase="parceiro" fundo="claro" />);
    const snippet = gerarSnippet({ frase: "parceiro", estilo: "caixa", fundo: "claro" });

    expect(snippet).toContain(`border-radius:${RAIO}px`);
    expect(screen.getAllByText(`${RAIO}px`).length).toBeGreaterThan(0);
    expect(screen.getAllByText("#E6E6EA", { exact: false }).length).toBeGreaterThan(0);
  });

  it("desaconselha o bloco de incorporar HTML, que é o erro que anula o selo", () => {
    render(<PassoAPassoWix frase="parceiro" fundo="claro" />);
    expect(screen.getByText(/não use o bloco de incorporar html/i)).toBeInTheDocument();
  });

  it("oferece o símbolo branco quando o rodapé é escuro", () => {
    const { rerender } = render(<PassoAPassoWix frase="parceiro" fundo="claro" />);
    expect(screen.getByRole("link", { name: /símbolo/i })).toHaveAttribute(
      "href",
      "/brand/simbolo-movepark-email.png",
    );

    rerender(<PassoAPassoWix frase="parceiro" fundo="escuro" />);
    expect(screen.getByRole("link", { name: /símbolo/i })).toHaveAttribute(
      "href",
      "/brand/simbolo-movepark-white-email.png",
    );
  });
});
