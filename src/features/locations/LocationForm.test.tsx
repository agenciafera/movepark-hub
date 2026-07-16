import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { LocationForm } from "./LocationForm";
import type { Location } from "@/types/domain";

const location = {
  id: "loc-1",
  company_id: "company-1",
  name: "Lote Teste",
  slug: "lote-teste",
  address: "Rua X",
  latitude: -23.43,
  longitude: -46.47,
  timezone: "America/Sao_Paulo",
  status: "active",
  destination_id: null,
  phone: null,
  email: null,
  notice: null,
  reservation_policy: null,
} as unknown as Location;

const DEST_LABEL = /Destino \(âncora de proximidade\)/i;

describe("LocationForm — gating do vínculo de destino", () => {
  it("mostra o seletor de destino no full scope (hub_admin)", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={() => {}}
        editableScope="full"
      />,
    );
    expect(screen.getByText(DEST_LABEL)).toBeInTheDocument();
  });

  it("esconde o seletor de destino no operator scope", () => {
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={() => {}}
        editableScope="operator"
      />,
    );
    expect(screen.queryByText(DEST_LABEL)).not.toBeInTheDocument();
  });
});

describe("LocationForm — foto obrigatória (operador)", () => {
  it("bloqueia salvar sem foto no operator scope (form não fecha)", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <LocationForm
        open
        companyId="company-1"
        location={location}
        onOpenChange={onOpenChange}
        editableScope="operator"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    // guarda impede o submit: onOpenChange(false) nunca é chamado
    await waitFor(() => {
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });
});
