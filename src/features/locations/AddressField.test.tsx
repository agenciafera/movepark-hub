import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { AddressField, type AddressValue } from "./AddressField";

// O mapa puxa o SDK do Maps; sem key ele já não renderiza, mas mockar deixa o
// teste hermético e rápido.
vi.mock("@/components/shared/LocationMapPreview", () => ({
  LocationMapPreview: () => null,
}));

const filled: AddressValue = {
  address: "Av. Rocha Pombo, s/n - Águas Belas",
  complement: "Portão azul",
  latitude: -25.52,
  longitude: -49.17,
  placeId: "ChIJ0testplaceid",
};

describe("AddressField", () => {
  it("mostra o endereço salvo como texto no display, não some", () => {
    renderWithProviders(<AddressField value={filled} onChange={vi.fn()} />);
    expect(screen.getByText("Av. Rocha Pombo, s/n - Águas Belas")).toBeInTheDocument();
    expect(screen.getByText("Portão azul")).toBeInTheDocument();
  });

  it("sem endereço, mostra estado vazio com ação de adicionar", () => {
    renderWithProviders(
      <AddressField
        value={{ address: "", complement: "", latitude: null, longitude: null, placeId: null }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nenhum endereço cadastrado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar endereço/ })).toBeInTheDocument();
    // sem endereço, não oferece "Editar"
    expect(screen.queryByRole("button", { name: /Editar endereço/ })).not.toBeInTheDocument();
  });

  it("editar abre o modal com o valor atual pré-preenchido", async () => {
    renderWithProviders(<AddressField value={filled} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Editar endereço/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/Endereço \(como aparece/)).toHaveValue(
      "Av. Rocha Pombo, s/n - Águas Belas",
    );
    expect(within(dialog).getByLabelText(/Complemento/)).toHaveValue("Portão azul");
  });

  it("salvar do modal devolve o valor editado ao pai e fecha", async () => {
    const onChange = vi.fn();
    renderWithProviders(<AddressField value={filled} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Editar endereço/ }));

    const dialog = screen.getByRole("dialog");
    const compl = within(dialog).getByLabelText(/Complemento/);
    await userEvent.clear(compl);
    await userEvent.type(compl, "Entrada lateral");
    await userEvent.click(within(dialog).getByRole("button", { name: "Usar este endereço" }));

    // O place_id sobrevive a uma edição que só mexe no complemento (aditivo).
    expect(onChange).toHaveBeenCalledWith({
      address: "Av. Rocha Pombo, s/n - Águas Belas",
      complement: "Entrada lateral",
      latitude: -25.52,
      longitude: -49.17,
      placeId: "ChIJ0testplaceid",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelar descarta a edição, sem chamar onChange", async () => {
    const onChange = vi.fn();
    renderWithProviders(<AddressField value={filled} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Editar endereço/ }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Complemento/), " mudado");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
