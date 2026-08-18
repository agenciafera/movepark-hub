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

  it("mostra apoio visual: logos, fotos dos destinos e a foto do passo a passo", () => {
    const { container } = renderPage();

    // O aceite da atividade é a página não ser só texto.
    const images = container.querySelectorAll("img");
    expect(images.length).toBeGreaterThanOrEqual(10);

    // O hero é foto de marca (blue hour), sob overlay navy, com a headline branca à
    // esquerda; e a foto do passo a passo segue presente. As fotos dos destinos são
    // decorativas, porque o nome já vem no texto do link ao lado.
    expect(screen.getByAltText(/caminhando até o carro/i)).toBeInTheDocument();
    expect(screen.getByAltText(/conferindo a reserva no celular/i)).toBeInTheDocument();
  });

  /**
   * A foto do passo a passo era a mesma `como-reservar.webp` que o CtaBanner usa
   * de fundo, e o banner fecha esta página: a mesma mulher aparecia duas vezes na
   * mesma rolagem, o que lê como erro de montagem e não como repetição de marca.
   */
  it("o passo a passo não repete a foto que o banner de fechamento usa", () => {
    const { container } = renderPage();

    const fontes = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    const daFaixa = fontes.filter((src) => src?.includes("como-reservar"));
    expect(daFaixa).toHaveLength(1);
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
