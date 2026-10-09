import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";

// Troca de placa pela equipe (fase 6): consulta preenche modelo e cor; sem achado, digita; sem
// motivo não salva (o servidor também recusa).
const lookup = vi.fn();
vi.mock("./api", () => ({ useLookupPlate: () => ({ mutateAsync: lookup, isPending: false }) }));

import { PlateChangeForm } from "./PlateChangeForm";

describe("PlateChangeForm", () => {
  it("consulta a placa, preenche modelo e cor, e só salva com motivo", async () => {
    lookup.mockResolvedValueOnce({ found: true, vehicle: { license_plate: "PXB2G98", brand: "Fiat", model: "Fiat Palio", color: "Preto" } });
    const onSubmit = vi.fn();
    renderWithProviders(<PlateChangeForm onSubmit={onSubmit} onCancel={vi.fn()} pending={false} />);

    await userEvent.type(screen.getByLabelText("Nova placa"), "pxb2g98");
    await userEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(lookup).toHaveBeenCalledWith("PXB2G98");
    expect(screen.getByLabelText("Modelo")).toHaveValue("Fiat Palio");
    expect(screen.getByLabelText("Cor")).toHaveValue("Preto");

    const salvar = screen.getByRole("button", { name: "Salvar placa" });
    expect(salvar).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Motivo"), "cliente trocou de carro");
    await userEvent.click(salvar);
    expect(onSubmit).toHaveBeenCalledWith({
      plate: "PXB2G98", brand: "Fiat", model: "Fiat Palio", color: "Preto", reason: "cliente trocou de carro",
    });
  });

  it("placa que a consulta não acha deixa modelo e cor para digitar", async () => {
    lookup.mockResolvedValueOnce({ found: false });
    renderWithProviders(<PlateChangeForm onSubmit={vi.fn()} onCancel={vi.fn()} pending={false} />);
    await userEvent.type(screen.getByLabelText("Nova placa"), "ABC1D23");
    await userEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(screen.getByText("Não achamos essa placa. Preencha o modelo e a cor.")).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toHaveValue("");
  });
});
