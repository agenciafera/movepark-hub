import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import SobrePage from "@/routes/sobre";

function renderPage() {
  return renderWithProviders(
    <HelmetProvider>
      <SobrePage />
    </HelmetProvider>,
  );
}

describe("SobrePage — /sobre", () => {
  it("abre com um único h1 e os CTAs da faixa de hero", () => {
    renderPage();

    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(/Vaga garantida/i);

    expect(screen.getAllByRole("link", { name: /Buscar estacionamento/i })[0]).toHaveAttribute(
      "href",
      "/search",
    );
    expect(screen.getByRole("link", { name: /Quero ser parceiro/i })).toHaveAttribute(
      "href",
      "/seja-parceiro",
    );
  });

  it("mostra apoio visual: foto de hero, fotos dos destinos e a foto do passo a passo", () => {
    const { container } = renderPage();

    // O aceite da atividade é a página não ser só texto.
    const images = container.querySelectorAll("img");
    expect(images.length).toBeGreaterThanOrEqual(9);

    // Hero e passo a passo têm alt descritivo (as fotos dos destinos são decorativas,
    // porque o nome do destino já vem no texto do link ao lado).
    expect(screen.getByAltText(/estacionamento parceiro da Movepark/i)).toBeInTheDocument();
    expect(screen.getByAltText(/reservando a vaga pelo celular/i)).toBeInTheDocument();
  });

  it("os cards de destino apontam pros slugs reais de /destinos", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /Guarulhos/i })).toHaveAttribute(
      "href",
      "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
    );
    expect(screen.getByRole("link", { name: /Lisboa/i })).toHaveAttribute(
      "href",
      "/destinos/aeroporto-humberto-delgado",
    );
    expect(screen.getByRole("link", { name: /Ver todos os destinos/i })).toHaveAttribute(
      "href",
      "/destinos",
    );
  });

  it("os números vêm rotulados (o valor sozinho não diz nada em leitor de tela)", () => {
    renderPage();

    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("estacionamentos parceiros")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("destinos com vaga")).toBeInTheDocument();
  });

  it("os 3 passos estão numa lista ordenada, na ordem do fluxo real", () => {
    renderPage();

    // A lista é nomeada pelo h2 da seção (aria-labelledby).
    const steps = screen.getByRole("list", { name: /Três passos/i });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/Busque pelo destino/i);
    expect(items[1]).toHaveTextContent(/Reserve e pague online/i);
    expect(items[2]).toHaveTextContent(/Chegue e deixe o carro/i);
  });
});
