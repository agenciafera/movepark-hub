import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ParkingCard, type ParkingCardProps } from "./ParkingCard";

function props(over: Partial<ParkingCardProps> = {}): ParkingCardProps {
  return {
    href: "/p/virapark/virapark/covered",
    coverImage: null,
    coverAlt: "Vaga Coberta em Virapark",
    title: "Virapark",
    parkingTypeName: "Vaga Coberta",
    price: { total: 119.6, unit: "4 diárias" },
    ...over,
  };
}

describe("ParkingCard (card único das três superfícies)", () => {
  it("mostra título, tipo de vaga, preço e a unidade", () => {
    renderWithProviders(<ParkingCard {...props()} />);
    expect(screen.getByRole("heading", { level: 3, name: "Virapark" })).toBeInTheDocument();
    expect(screen.getByText("Vaga Coberta")).toBeInTheDocument();
    expect(screen.getByText("R$ 119,60")).toBeInTheDocument();
    expect(screen.getByText("4 diárias")).toBeInTheDocument();
  });

  it("colore o chip do tipo conforme o código do parking_type", () => {
    renderWithProviders(<ParkingCard {...props({ parkingTypeCode: "covered" })} />);
    expect(screen.getByText("Vaga Coberta").className).toContain("text-blue-700");
  });

  it("tipo sem código conhecido usa o chip neutro (não quebra o layout)", () => {
    renderWithProviders(<ParkingCard {...props()} />);
    expect(screen.getByText("Vaga Coberta").className).toContain("bg-surface-strong");
  });

  it("disponível: o card é clicável (tem link para o listing)", () => {
    const { container } = renderWithProviders(<ParkingCard {...props()} />);
    expect(container.querySelector('a[href="/p/virapark/virapark/covered"]')).not.toBeNull();
  });

  it("esgotado: não é clicável (sem âncoras) e mantém o conteúdo", () => {
    const { container } = renderWithProviders(<ParkingCard {...props({ soldOut: true })} />);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Vaga Coberta")).toBeInTheDocument();
  });

  it("favorito: reflete o estado e dispara o toggle no clique", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <ParkingCard {...props({ favorite: { isSaved: false, onToggle } })} />,
    );
    const btn = screen.getByRole("button", { name: "Salvar nos favoritos" });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("sem favorite: não renderiza o botão de coração", () => {
    renderWithProviders(<ParkingCard {...props()} />);
    expect(screen.queryByRole("button", { name: /favoritos|salvos/i })).toBeNull();
  });

  it("rating some quando não há avaliação", () => {
    renderWithProviders(<ParkingCard {...props({ rating: { avg: null, count: 0 } })} />);
    expect(screen.queryByText(/avaliação|avaliações/)).toBeNull();
  });

  it("rating aparece quando há avaliação", () => {
    renderWithProviders(<ParkingCard {...props({ rating: { avg: 4.8, count: 127 } })} />);
    expect(screen.getByText(/127 avaliações/)).toBeInTheDocument();
  });

  it("amenidades escondidas quando a lista está vazia", () => {
    renderWithProviders(<ParkingCard {...props({ amenities: [], amenitiesTestId: "amen" })} />);
    expect(screen.queryByTestId("amen")).toBeNull();
  });

  it("amenidades exibidas quando presentes", () => {
    renderWithProviders(
      <ParkingCard
        {...props({
          amenities: [{ code: "shuttle_free", label: "Transfer grátis" }],
          amenitiesTestId: "amen",
        })}
      />,
    );
    expect(screen.getByTestId("amen")).toBeInTheDocument();
    expect(screen.getByText("Transfer grátis")).toBeInTheDocument();
  });

  it("preço antigo não aparece quando não é maior que o atual", () => {
    const { container } = renderWithProviders(
      <ParkingCard {...props({ price: { total: 100, oldPrice: 90, unit: "1 diária" } })} />,
    );
    expect(container.querySelector(".line-through")).toBeNull();
  });

  it("preço antigo aparece riscado quando é maior que o atual", () => {
    renderWithProviders(
      <ParkingCard {...props({ price: { total: 100, oldPrice: 150, unit: "1 diária" } })} />,
    );
    expect(screen.getByText("R$ 150,00")).toBeInTheDocument();
  });
});
