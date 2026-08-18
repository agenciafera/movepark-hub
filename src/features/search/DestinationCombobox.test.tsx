import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("./api", () => ({
  useDestinations: () => ({
    data: [
      {
        id: "d-gru",
        code: "GRU",
        name: "Aeroporto de Guarulhos",
        short_name: "Guarulhos",
        slug: "guarulhos",
        type: "airport",
        city: "São Paulo",
        state: "SP",
        country: "BR",
        latitude: 0,
        longitude: 0,
        is_popular: true,
        sort_order: 1,
      },
    ],
  }),
  useAllDestinationPoints: () => ({
    data: [
      { id: "pt-2", destination_id: "d-gru", name: "Terminal 2", type: "terminal", sort_order: 2 },
    ],
  }),
}));

import { DestinationCombobox } from "./DestinationCombobox";

describe("DestinationCombobox — terminais (E2.1.2)", () => {
  it("trigger mostra aeroporto · terminal quando há pointValue", () => {
    renderWithProviders(<DestinationCombobox value="GRU" pointValue="pt-2" onChange={vi.fn()} />);
    expect(screen.getByText("Guarulhos · Terminal 2")).toBeInTheDocument();
  });

  it("lista o terminal sob o aeroporto e emite onChange(code, pointId)", () => {
    const onChange = vi.fn();
    renderWithProviders(<DestinationCombobox value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText(/Terminal 2/));
    expect(onChange).toHaveBeenCalledWith("GRU", "pt-2");
  });

  it("selecionar o aeroporto emite onChange(code, null)", () => {
    const onChange = vi.fn();
    renderWithProviders(<DestinationCombobox value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Guarulhos"));
    expect(onChange).toHaveBeenCalledWith("GRU", null);
  });
});

/**
 * Buscar em todos os aeroportos sempre foi um estado válido (é o que a busca faz
 * sem `dest`), mas era um estado que só dava para alcançar sem querer: depois de
 * marcar um destino, não havia como desmarcar.
 */
describe("DestinationCombobox — todos os destinos", () => {
  it("oferece a opção e ela limpa o destino e o terminal", () => {
    const onChange = vi.fn();
    renderWithProviders(<DestinationCombobox value="GRU" pointValue="pt-2" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("Todos os destinos"));
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  /** A marca diz qual é o escopo atual; sem ela a opção parece um botão morto. */
  it("a marca fica em 'Todos os destinos' quando nenhum destino está escolhido", () => {
    const { container } = renderWithProviders(
      <DestinationCombobox value={null} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button"));

    const itens = [...container.ownerDocument.querySelectorAll("[cmdk-item]")];
    const marcados = itens.filter((i) => i.querySelector("svg.text-mp-primary"));
    expect(marcados).toHaveLength(1);
    expect(marcados[0]).toHaveTextContent("Todos os destinos");
  });

  /** Quem digita "GRU" quer o GRU, não uma opção genérica no topo do resultado. */
  it("digitar o código do aeroporto não deixa a opção genérica na frente", () => {
    const { container } = renderWithProviders(
      <DestinationCombobox value={null} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText(/código IATA/i), { target: { value: "GRU" } });

    const rotulos = [...container.ownerDocument.querySelectorAll("[cmdk-item]")].map(
      (i) => i.textContent,
    );
    expect(rotulos.some((r) => r?.includes("Guarulhos"))).toBe(true);
    expect(rotulos.some((r) => r?.includes("Todos os destinos"))).toBe(false);
  });
});
