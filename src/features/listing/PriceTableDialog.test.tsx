import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PriceTableDialog } from "./PriceTableDialog";
import { useDurationPrices } from "./api";

vi.mock("./api", () => ({ useDurationPrices: vi.fn() }));

// Mock: cada duração rende um preço determinístico (R$ 30/dia)
vi.mocked(useDurationPrices).mockImplementation(
  (args: { durations: number[] }) =>
    args.durations.map((days) => ({
      data: { price: days * 30, old_price: null, discount: null, days, error: null },
      isLoading: false,
    })) as never,
);

describe("PriceTableDialog", () => {
  it("renderiza linhas por duração e destaca a buscada", () => {
    renderWithProviders(
      <PriceTableDialog
        open
        onOpenChange={vi.fn()}
        companySlug="aerovalet"
        locationSlug="gru"
        parkingTypeCode="covered"
        selectedDays={7}
        title="Vaga coberta"
      />,
    );
    // buckets incluem 1, 7, 30…
    expect(screen.getByText("1 diária")).toBeInTheDocument();
    expect(screen.getByText("7 diárias")).toBeInTheDocument();
    // total de 7 diárias = 210; por-dia = 30
    expect(screen.getByText("R$ 210,00")).toBeInTheDocument();
    // a duração buscada ganha o selo "sua busca"
    expect(screen.getByText("sua busca")).toBeInTheDocument();
  });

  it("inclui a duração buscada fora dos buckets padrão", () => {
    renderWithProviders(
      <PriceTableDialog
        open
        onOpenChange={vi.fn()}
        companySlug="aerovalet"
        locationSlug="gru"
        parkingTypeCode="covered"
        selectedDays={4}
      />,
    );
    expect(screen.getByText("4 diárias")).toBeInTheDocument();
  });
});
