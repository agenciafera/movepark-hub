import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { LocationAddressAuditRow } from "@/types/domain";

const { rows, applyMutate, dismissMutate, scanMutate, verifyMutate } = vi.hoisted(() => ({
  rows: { current: [] as unknown[] },
  applyMutate: vi.fn(),
  dismissMutate: vi.fn(),
  scanMutate: vi.fn(),
  verifyMutate: vi.fn(),
}));

vi.mock("@/features/location-address-audit/api", () => ({
  useLocationAddressAudit: () => ({ data: rows.current, isLoading: false }),
  useRunAddressScan: () => ({ mutate: scanMutate, isPending: false }),
  useVerifyAddresses: () => ({ mutate: verifyMutate, isPending: false }),
  useApplyAddressCorrection: () => ({ mutate: applyMutate, isPending: false }),
  useDismissAddressAudit: () => ({ mutate: dismissMutate, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManagerAuditoriaEnderecos from "./auditoria-enderecos";

function makeRow(over: Partial<LocationAddressAuditRow> = {}): LocationAddressAuditRow {
  return {
    location_id: "loc-1",
    location_name: "Aeroporto de Guarulhos",
    company_name: "Aerovalet",
    slug: "aeroporto-guarulhos",
    status: "active",
    is_listed: true,
    address: "Av. Novo Brasil, 954 - Guarulhos - SP",
    latitude: -23.4766,
    longitude: -46.472,
    google_place_id: null,
    google_maps_url: null,
    destination_id: "d-gru",
    destination_code: "GRU",
    destination_name: "Guarulhos",
    distance_km: 4.77,
    flags: [],
    scanned_at: "2026-08-19T00:00:00Z",
    verified_at: null,
    verify_status: "pending",
    fetch_error: null,
    match_place_id: null,
    match_name: null,
    match_address: null,
    match_latitude: null,
    match_longitude: null,
    match_maps_url: null,
    match_business_status: null,
    name_similarity: null,
    drift_m: null,
    suggested_destination_code: null,
    suggested_distance_km: null,
    decision: "pending",
    decision_note: null,
    reviewed_at: null,
    ...over,
  };
}

describe("ManagerAuditoriaEnderecos", () => {
  beforeEach(() => {
    rows.current = [];
    vi.clearAllMocks();
  });

  it("traduz os sinais da triagem em vez de mostrar o identificador do SQL", () => {
    rows.current = [makeRow({ flags: ["place_id_nao_e_estabelecimento", "longe_do_destino"] })];
    renderWithProviders(<ManagerAuditoriaEnderecos />);
    expect(screen.getByText("Place ID é de endereço")).toBeInTheDocument();
    expect(screen.getByText("longe do destino")).toBeInTheDocument();
  });

  it("mostra o desvio em metros, que é o sinal que decide", () => {
    rows.current = [makeRow({ verify_status: "divergent", drift_m: 4412.3 })];
    renderWithProviders(<ManagerAuditoriaEnderecos />);
    expect(screen.getByText("divergente")).toBeInTheDocument();
    // 4412,3 m sai formatado em km, na vírgula do pt-BR.
    expect(screen.getByText(/4,4 km do pino do Google/)).toBeInTheDocument();
  });

  it("sem proposta do Google, aplicar fica desligado", () => {
    rows.current = [makeRow()];
    renderWithProviders(<ManagerAuditoriaEnderecos />);
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    expect(screen.getByRole("button", { name: "Aplicar correção" })).toBeDisabled();
  });

  it("avisa quando aceitar a coordenada troca o aeroporto ancorado", () => {
    rows.current = [
      makeRow({
        verify_status: "divergent",
        match_address: "Rua Outra, 10 - Campinas - SP",
        match_latitude: -23.0,
        match_longitude: -47.13,
        suggested_destination_code: "VCP",
        suggested_distance_km: 0.4,
        drift_m: 90000,
      }),
    ];
    renderWithProviders(<ManagerAuditoriaEnderecos />);
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    expect(screen.getByText(/muda o destino de GRU para VCP/)).toBeInTheDocument();
  });

  it("aplicar manda a coordenada proposta e pede o re-vínculo do destino", () => {
    rows.current = [
      makeRow({
        verify_status: "divergent",
        match_address: "Rua Certa, 55 - Guarulhos - SP",
        match_latitude: -23.43,
        match_longitude: -46.47,
        match_place_id: "ChIJcerto",
      }),
    ];
    renderWithProviders(<ManagerAuditoriaEnderecos />);
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar correção" }));

    expect(applyMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "loc-1",
        latitude: -23.43,
        longitude: -46.47,
        googlePlaceId: "ChIJcerto",
        relinkDestination: true,
      }),
      expect.anything(),
    );
  });

  it("nenhuma pendência mostra o estado vazio, não uma tabela em branco", () => {
    rows.current = [];
    renderWithProviders(<ManagerAuditoriaEnderecos />);
    expect(screen.getByText("Nenhuma pendência")).toBeInTheDocument();
  });
});
