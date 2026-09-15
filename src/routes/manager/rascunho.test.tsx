import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, mockAuth } from "@/test/utils";

let ficha: unknown = null;

vi.mock("@/features/listing/api", () => ({
  useListingDraft: () => ({ data: ficha, isLoading: false, error: null }),
}));
vi.mock("@/features/listing/ReservationCard", () => ({
  ReservationCard: ({ listing }: { listing: { location: { name: string } } }) => (
    <div data-testid="reservation-card">card de {listing.location.name}</div>
  ),
}));
vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...real, useParams: () => ({ companyId: "c1", locationId: "l1" }) };
});

import ManagerRascunho from "./rascunho";

describe("ManagerRascunho", () => {
  it("monta a ficha em rascunho com o card de reserva e o aviso de que só a Movepark vê", () => {
    ficha = { location: { name: "Agência Fera", public_name: null } };
    renderWithProviders(<ManagerRascunho />, { auth: mockAuth({ effectiveRole: "hub_admin" }) });
    expect(screen.getByTestId("reservation-card")).toHaveTextContent("card de Agência Fera");
    expect(screen.getByText("Não listada")).toBeInTheDocument();
    expect(screen.getByText("invisível para clientes")).toBeInTheDocument();
  });

  it("sem ficha explica o que falta, em vez de quebrar", () => {
    ficha = null;
    renderWithProviders(<ManagerRascunho />, { auth: mockAuth({ effectiveRole: "hub_admin" }) });
    expect(screen.getByText("Não consegui montar a ficha")).toBeInTheDocument();
  });
});
