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
    data: [{ id: "pt-2", destination_id: "d-gru", name: "Terminal 2", type: "terminal", sort_order: 2 }],
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
