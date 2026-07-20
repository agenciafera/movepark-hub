import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PartnerLogos } from "./PartnerLogos";

describe("PartnerLogos", () => {
  it("mostra os 7 logos com o nome do parceiro no alt", () => {
    render(<PartnerLogos />);

    const logos = screen.getAllByRole("img");
    expect(logos).toHaveLength(7);
    expect(screen.getByAltText("Virapark")).toBeInTheDocument();
    expect(screen.getByAltText("Garage Inn")).toBeInTheDocument();
    expect(screen.getByAltText("Aeropark")).toBeInTheDocument();
  });

  it("aponta pra pasta sem espaço no caminho", () => {
    // A pasta veio como "Logos Estacionamentos"; num caminho de URL o espaço vira
    // %20 e a maiúscula quebra no Linux do Cloudflare, que é case-sensitive.
    render(<PartnerLogos />);

    for (const img of screen.getAllByRole("img")) {
      const src = img.getAttribute("src") ?? "";
      expect(src).toMatch(/^\/images\/parceiros\/[a-z0-9-]+\.svg$/);
    }
  });

  it("varia a altura por logo, pra todos pesarem igual no mural", () => {
    // Com uma altura só, o Abbapark (proporção 1.84) saía bem menor que o
    // Garage Inn (4.92). Regressão: alguém padronizar a altura de novo.
    render(<PartnerLogos />);

    const alturas = new Set(
      screen.getAllByRole("img").map((img) => {
        const cls = img.getAttribute("class") ?? "";
        return cls.match(/\bh-\d+\b/)?.[0];
      }),
    );
    expect(alturas.size).toBeGreaterThan(1);
  });

  it("esconde o título quando recebe null", () => {
    const { rerender } = render(<PartnerLogos />);
    expect(screen.getByText(/Estacionamentos que já são Movepark/i)).toBeInTheDocument();

    rerender(<PartnerLogos title={null} />);
    expect(screen.queryByText(/Estacionamentos que já são Movepark/i)).not.toBeInTheDocument();
  });
});
