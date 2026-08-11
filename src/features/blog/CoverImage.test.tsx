import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CoverImage } from "./CoverImage";

const SRC = "https://exemplo.supabase.co/storage/v1/object/public/assets-public/blog/x/capa.webp";

describe("CoverImage", () => {
  it("dá alt à imagem que o leitor vê", () => {
    render(<CoverImage src={SRC} alt="Estacionamento no Aeroporto de Congonhas" widths={[400]} sizes="100vw" />);

    const img = screen.getByAltText("Estacionamento no Aeroporto de Congonhas");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("aria-hidden")).toBeNull();
  });

  it("esconde o fundo desfocado de quem usa leitor de tela", () => {
    const { container } = render(
      <CoverImage src={SRC} alt="Capa" widths={[400]} sizes="100vw" />,
    );

    const fundo = container.querySelectorAll('img[aria-hidden="true"]');
    expect(fundo).toHaveLength(1);
    // O fundo é decoração: alt vazio é o que o tira da árvore de acessibilidade.
    expect(fundo[0].getAttribute("alt")).toBe("");
  });
});
