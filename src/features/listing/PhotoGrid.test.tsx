import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PhotoGrid } from "./PhotoGrid";
import { wrapIndex } from "./PhotoGrid.logic";

describe("wrapIndex", () => {
  it("avança e dá a volta", () => {
    expect(wrapIndex(0, 3, 1)).toBe(1);
    expect(wrapIndex(2, 3, 1)).toBe(0); // wrap p/ frente
    expect(wrapIndex(0, 3, -1)).toBe(2); // wrap p/ trás
  });
  it("é seguro com lista vazia", () => {
    expect(wrapIndex(0, 0, 1)).toBe(0);
  });
});

describe("PhotoGrid", () => {
  it("sem fotos: mantém o layout com placeholders e sem CTA de galeria", () => {
    render(<PhotoGrid title="Virapark" />);
    expect(screen.getAllByText("Foto em breve").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Ver todas as fotos/i })).not.toBeInTheDocument();
  });

  it("com fotos: renderiza as imagens e o CTA de galeria", () => {
    render(<PhotoGrid title="Virapark" photoUrls={["https://cdn/p1.jpg", "https://cdn/p2.jpg"]} />);
    // mobile + desktop renderizam a mesma foto → ao menos 1 ocorrência por slot
    expect(screen.getAllByAltText("Foto 1 de Virapark").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Ver todas as fotos/i })).toBeInTheDocument();
  });

  it("abre o lightbox ao clicar numa foto e navega", () => {
    render(
      <PhotoGrid
        title="Virapark"
        photoUrls={["https://cdn/p1.jpg", "https://cdn/p2.jpg", "https://cdn/p3.jpg"]}
      />,
    );
    // abre na 2ª foto (índice 1) clicando no slot correspondente
    fireEvent.click(screen.getAllByRole("button", { name: /Abrir foto 2 de Virapark/i })[0]);
    expect(screen.getByText("Fotos de Virapark")).toBeInTheDocument();
    expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("2 / 3");

    fireEvent.click(screen.getByRole("button", { name: /Próxima foto/i }));
    expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("3 / 3");

    fireEvent.click(screen.getByRole("button", { name: /Próxima foto/i }));
    expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 3"); // dá a volta
  });
});
