import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import ComoFuncionaPage from "@/routes/como-funciona";

function renderPage() {
  return renderWithProviders(
    <HelmetProvider>
      <ComoFuncionaPage />
    </HelmetProvider>,
  );
}

describe("ComoFuncionaPage — contrato de página de conteúdo", () => {
  it("abre com um único h1 (via PageHeader)", () => {
    renderPage();
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(/Reserve sua vaga/i);
  });

  it("o CTA final é um <Button> de 48px apontando para a home", () => {
    renderPage();
    const cta = screen.getByRole("link", { name: /Buscar estacionamento/i });
    expect(cta).toHaveAttribute("href", "/");
    expect(cta.className).toContain("h-12");
  });

  it("os títulos de seção usam o token de heading de conteúdo (display-sm)", () => {
    renderPage();
    const secao = screen.getByRole("heading", { level: 2, name: "Passo a passo" });
    expect(secao.className).toContain("text-display-sm");
  });
});
