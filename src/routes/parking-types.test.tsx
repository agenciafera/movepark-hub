import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import ParkingTypesPage from "./parking-types";
import {
  useLocationParkingTypes,
  useUpdateLocationParkingType,
  useTriggerWlMirror,
  type LocationParkingTypeWithRelations,
} from "@/features/parking-types/api";
import { useLocation } from "@/features/locations/api";
import { useCompany } from "@/features/companies/api";
import { useWlCatalog } from "@/features/availability/api";
import { usePricingCurve } from "@/features/parking-types/pricing-curve";

// O gate de quem dispara é server-authoritative (wl_mirror_trigger exige is_hub_admin, coberto
// no pgTAP) e a rota /manager fica sob RequireRole hub_admin. Aqui o foco é o botão: só aparece
// pra vaga externa mapeada, pede confirmação e dispara a mutation certa.
vi.mock("@/features/parking-types/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/parking-types/api")>();
  return {
    ...actual,
    useLocationParkingTypes: vi.fn(),
    useUpdateLocationParkingType: vi.fn(),
    useTriggerWlMirror: vi.fn(),
  };
});
vi.mock("@/features/locations/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/locations/api")>();
  return { ...actual, useLocation: vi.fn() };
});
vi.mock("@/features/companies/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/companies/api")>();
  return { ...actual, useCompany: vi.fn() };
});
vi.mock("@/features/availability/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/availability/api")>();
  return { ...actual, useWlCatalog: vi.fn() };
});
vi.mock("@/features/parking-types/pricing-curve", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/parking-types/pricing-curve")>();
  return { ...actual, usePricingCurve: vi.fn() };
});

const ROUTE_PATH = "/manager/companies/:companyId/locations/:locationId/parking-types";
const ROUTE = "/manager/companies/company-1/locations/location-1/parking-types";

function makeLpt(overrides?: Partial<LocationParkingTypeWithRelations>): LocationParkingTypeWithRelations {
  const base = {
    id: "lpt-1",
    location_id: "location-1",
    company_parking_type_id: "cpt-1",
    capacity: 10,
    is_active: true,
    has_minimum_stay: false,
    minimum_stay_value: null,
    minimum_stay_unit: null,
    has_minimum_date: false,
    minimum_date: null,
    wl_category_slug: "aerovalet-congonhas",
    wl_product_slug: "vaga-coberta-cgh",
    company_parking_type: {
      id: "cpt-1",
      base_price: 40,
      parking_type: { id: "pt-1", code: "covered", name: "Coberta" },
    },
    pricing_rule: {
      id: "pr-1",
      location_parking_type_id: "lpt-1",
      strategy: "uniform_by_duration",
      mirror_status: "ok",
      mirror_verified_at: "2026-08-18T01:01:23.699Z",
      mirror_sampled_at: "2026-08-12T22:48:09.073Z",
      mirror_source: "wl_sampling",
      tiers: [],
    },
  };
  return { ...base, ...overrides } as unknown as LocationParkingTypeWithRelations;
}

function setup(opts: {
  lpt: LocationParkingTypeWithRelations;
  checkoutMode: string;
  triggerMutateAsync?: ReturnType<typeof vi.fn>;
  triggerPending?: boolean;
}) {
  const triggerMutateAsync = opts.triggerMutateAsync ?? vi.fn().mockResolvedValue(undefined);

  vi.mocked(useLocationParkingTypes).mockReturnValue({
    data: [opts.lpt],
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useUpdateLocationParkingType).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
  vi.mocked(useTriggerWlMirror).mockReturnValue({
    mutateAsync: triggerMutateAsync,
    isPending: opts.triggerPending ?? false,
  } as never);
  vi.mocked(useLocation).mockReturnValue({
    data: {
      id: "location-1",
      slug: "aeroporto-congonhas",
      name: "Aerovalet Congonhas",
      company_id: "company-1",
      checkout_mode: opts.checkoutMode,
    },
    isLoading: false,
  } as never);
  vi.mocked(useCompany).mockReturnValue({
    data: { id: "company-1", slug: "aerovalet" },
    isLoading: false,
  } as never);
  vi.mocked(useWlCatalog).mockReturnValue({ data: undefined, isLoading: false } as never);
  vi.mocked(usePricingCurve).mockReturnValue({ data: [] } as never);

  renderWithProviders(<ParkingTypesPage />, { path: ROUTE_PATH, route: ROUTE });
  return { triggerMutateAsync };
}

describe("ParkingTypesPage · sincronização manual do espelho de preço WL", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra o botão e o status do espelho pra vaga externa mapeada", () => {
    setup({ lpt: makeLpt(), checkoutMode: "external" });
    expect(screen.getByRole("button", { name: /Sincronizar agora/ })).toBeInTheDocument();
    expect(screen.getByText(/ok · verificado em/)).toBeInTheDocument();
  });

  it("não mostra o botão pra vaga nativa (checkout_mode=hub)", () => {
    setup({ lpt: makeLpt(), checkoutMode: "hub" });
    expect(screen.queryByRole("button", { name: /Sincronizar agora/ })).not.toBeInTheDocument();
  });

  it("não mostra o botão pra vaga externa sem mapeamento WL salvo", () => {
    setup({
      lpt: makeLpt({ wl_category_slug: null, wl_product_slug: null }),
      checkoutMode: "external",
    });
    expect(screen.queryByRole("button", { name: /Sincronizar agora/ })).not.toBeInTheDocument();
  });

  it("mostra divergente quando mirror_status é divergent", () => {
    setup({
      lpt: makeLpt({
        pricing_rule: {
          ...makeLpt().pricing_rule,
          mirror_status: "divergent",
        },
      }),
      checkoutMode: "external",
    });
    expect(screen.getByText("divergente")).toBeInTheDocument();
  });

  it("pede confirmação e dispara a mutation com o id da vaga ao confirmar", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { triggerMutateAsync } = setup({ lpt: makeLpt(), checkoutMode: "external" });

    await userEvent.click(screen.getByRole("button", { name: /Sincronizar agora/ }));

    expect(window.confirm).toHaveBeenCalled();
    expect(triggerMutateAsync).toHaveBeenCalledWith("lpt-1");
  });

  it("não dispara nada se cancelar a confirmação", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { triggerMutateAsync } = setup({ lpt: makeLpt(), checkoutMode: "external" });

    await userEvent.click(screen.getByRole("button", { name: /Sincronizar agora/ }));

    expect(triggerMutateAsync).not.toHaveBeenCalled();
  });

  it("desabilita o botão e mostra o loading enquanto a mutation está pendente", () => {
    setup({ lpt: makeLpt(), checkoutMode: "external", triggerPending: true });
    const button = screen.getByRole("button", { name: /Disparando/ });
    expect(button).toBeDisabled();
  });
});
