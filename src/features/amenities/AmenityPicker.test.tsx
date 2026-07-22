import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { AmenityPicker } from "./AmenityPicker";
import { useAmenityCatalog, type Amenity } from "./api";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, useAmenityCatalog: vi.fn() };
});

const catalogo: Amenity[] = [
  { code: "cameras_24h", name: "Câmeras 24h", description: "Monitorado", icon: null, category: "security", sort_order: 1 },
  { code: "gated_access", name: "Portaria", description: null, icon: null, category: "security", sort_order: 2 },
  { code: "valet", name: "Valet", description: "Manobrista", icon: null, category: "service", sort_order: 1 },
];

function setup(selected: string[]) {
  vi.mocked(useAmenityCatalog).mockReturnValue({ data: catalogo, isLoading: false } as never);
  const onChange = vi.fn();
  renderWithProviders(<AmenityPicker selected={selected} onChange={onChange} />);
  return { onChange };
}

describe("AmenityPicker", () => {
  it("agrupa pelas categorias do catálogo, na ordem definida", () => {
    setup([]);
    const grupos = screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent);
    expect(grupos).toEqual(["Segurança", "Serviço"]);
  });

  it("reflete o que já está marcado", () => {
    setup(["valet"]);
    expect(screen.getByRole("checkbox", { name: /Valet/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Câmeras/ })).not.toBeChecked();
  });

  it("marcar adiciona o código ao conjunto", async () => {
    const { onChange } = setup(["valet"]);
    await userEvent.click(screen.getByRole("checkbox", { name: /Câmeras/ }));
    expect(onChange).toHaveBeenCalledWith(["valet", "cameras_24h"]);
  });

  it("desmarcar remove o código, sem mexer no resto", async () => {
    const { onChange } = setup(["valet", "cameras_24h"]);
    await userEvent.click(screen.getByRole("checkbox", { name: /Valet/ }));
    expect(onChange).toHaveBeenCalledWith(["cameras_24h"]);
  });

  it("avisa quando nada está marcado", () => {
    setup([]);
    expect(screen.getByText(/card da busca fica sem benefícios/i)).toBeInTheDocument();
  });
});
