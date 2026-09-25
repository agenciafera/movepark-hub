import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { FareComparisonDialog } from "./FareComparisonDialog";
import { DEFAULT_CATALOG } from "./fareMatrix.logic";

// 23/09/2026: o comparativo lê a matriz do catálogo; vaga garantida sai do grid e a alteração
// de data avisa que reprecifica.
describe("FareComparisonDialog", () => {
  it("monta as colunas e as linhas a partir do catálogo", () => {
    renderWithProviders(<FareComparisonDialog open onOpenChange={() => {}} selectedFare="flex" onSelect={() => {}} fares={DEFAULT_CATALOG} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Superflex")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Cancelamento grátis até 24h antes")).toHaveLength(3);
    expect(within(dialog).getAllByText("Proteção de voo: atraso ou cancelamento")).toHaveLength(3);
    // Suporte prioritário saiu do catálogo em 25/09/2026.
    expect(within(dialog).queryByText("Suporte prioritário")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Vaga garantida em qualquer tarifa.")).toBeInTheDocument();
    expect(within(dialog).getByText(/recalculada pelo preço do dia/)).toBeInTheDocument();
    expect(within(dialog).queryByText("Vaga garantida")).not.toBeInTheDocument();
  });

  it("tarifa desligada no catálogo não aparece; benefício desligado some da linha", () => {
    const cat = DEFAULT_CATALOG.filter((f) => f.tier !== "superflex");
    renderWithProviders(<FareComparisonDialog open onOpenChange={() => {}} selectedFare="flex" onSelect={() => {}} fares={cat} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Superflex")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Suporte prioritário")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/até 1 min antes/)).not.toBeInTheDocument();
  });
});
