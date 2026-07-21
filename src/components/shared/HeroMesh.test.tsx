import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroMesh } from "./HeroMesh";
import { PALETTES, meshBackground } from "./HeroMesh.logic";

describe("HeroMesh", () => {
  it("renderiza o conteúdo por cima do gradient", () => {
    render(
      <HeroMesh>
        <h1>Vaga garantida</h1>
      </HeroMesh>,
    );

    expect(screen.getByRole("heading", { name: "Vaga garantida" })).toBeInTheDocument();
  });

  it("o HTML pré-renderizado já sai pintado, sem esperar o efeito", () => {
    // O que importa aqui é a saída do SSG, e ela vem do renderizador de servidor do
    // React, não do jsdom (que descarta `background-image` por não parsear o data-URI
    // do grão). Por isso este caso usa `renderToStaticMarkup`: é o HTML de verdade.
    const html = renderToStaticMarkup(<HeroMesh palette="navy" />);

    expect(html).toContain("background-color:#29263F");
    expect(html).toContain("radial-gradient");
    expect(html).toContain("feTurbulence"); // o grão
  });

  it("não deixa o shorthand `background` entrar pelo className", () => {
    // O handoff avisa: o shorthand zera o `background-image` que o loop reescreve a
    // cada quadro. Quem precisa de cor de fundo põe num filho.
    const { container } = render(<HeroMesh className="text-white" />);
    const cls = (container.firstChild as HTMLElement).className;

    expect(cls).toContain("text-white");
    expect(cls).toContain("overflow-hidden");
    expect(cls).not.toMatch(/\bbg-/);
  });
});

describe("meshBackground", () => {
  it("empilha grão e as três manchas, nessa ordem", () => {
    const camadas = meshBackground("navy", 0, false).split("radial-gradient");

    expect(camadas[0]).toContain("feTurbulence");
    expect(camadas).toHaveLength(4); // grão + 3 manchas
  });

  it("em ph=0 o quadro é idêntico com e sem animação", () => {
    // A regra de ouro do handoff: `sin(x + p) - sin(p)` vale zero em ph=0, e é isso
    // que evita o salto no primeiro quadro do loop.
    expect(meshBackground("navy", 0, true)).toBe(meshBackground("navy", 0, false));
  });

  it("o quadro muda ao longo do tempo quando anima", () => {
    expect(meshBackground("navy", 1.5, true)).not.toBe(meshBackground("navy", 0, true));
  });

  it("congelado, o quadro não muda com o relógio", () => {
    expect(meshBackground("navy", 9, false)).toBe(meshBackground("navy", 0, false));
  });

  it("mantém a geometria exata do handoff nas três paletas", () => {
    // Centro e alcance vêm do design; mexer aqui descaracteriza o gradient. Os centros
    // são os mesmos nas três; o que muda é a cor e o alcance.
    expect(PALETTES.navy.blobs).toEqual([
      { hex: "#5D5FEF", x: 68.1, y: 46.03, reach: 44 },
      { hex: "#4041A3", x: 25.17, y: 75.99, reach: 48 },
      { hex: "#818FAF", x: 53.11, y: 12.71, reach: 60 },
    ]);
    expect(PALETTES.brand.blobs).toEqual([
      { hex: "#5D5FEF", x: 68.1, y: 46.03, reach: 41.1 },
      { hex: "#4041A3", x: 25.17, y: 75.99, reach: 44.6 },
      { hex: "#E4F2FF", x: 53.11, y: 12.71, reach: 66.65 },
    ]);
    expect(PALETTES.aurora.blobs).toEqual([
      { hex: "#5D5FEF", x: 68.1, y: 46.03, reach: 42 },
      { hex: "#A6DBDF", x: 25.17, y: 75.99, reach: 46 },
      { hex: "#DA455E", x: 53.11, y: 12.71, reach: 52 },
    ]);
  });

  it("cada paleta declara a cor de texto que combina com o fundo", () => {
    // Piso mínimo: a tinta declarada tem que passar no AA contra o backdrop. Não cobre
    // o pior caso sobre as manchas (que depende do tamanho do elemento), mas pega o
    // erro grosso de texto branco em paleta de fundo claro.
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string) => {
      const h = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };

    for (const [nome, pal] of Object.entries(PALETTES)) {
      const [hi, lo] = [lum(pal.ink), lum(pal.backdrop)].sort((a, b) => b - a);
      const razao = (hi + 0.05) / (lo + 0.05);
      expect(razao, `paleta ${nome}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("não arredonda o centro por quadro", () => {
    // Arredondar causa movimento em degraus. Os centros saem com 3 casas.
    expect(meshBackground("navy", 2.3, true)).toMatch(/circle at \d+\.\d{3}% \d+\.\d{3}%/);
  });
});
