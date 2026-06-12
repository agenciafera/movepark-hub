import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
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
