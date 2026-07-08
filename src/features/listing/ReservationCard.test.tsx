import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders, mockAuth } from "@/test/utils";
import { ReservationCard } from "./ReservationCard";

// mutateAsync do useValidateCoupon — hoisted pra poder ser referenciado no vi.mock.
const validateMutate = vi.hoisted(() => vi.fn());

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual, // mantém useDurationPrices etc. usados pelos diálogos filhos
    useSimulatePrice: () => ({ data: { price: 100, currency: "BRL" }, isFetching: false }),
    useAvailability: () => ({ data: undefined }), // availabilityUi(undefined) → canReserve:true
    useLocationAddOns: () => ({ data: [] }),
    useCreateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useValidateCoupon: () => ({ mutateAsync: validateMutate, isPending: false }),
    useDebounced: <T,>(v: T) => v,
  };
});
vi.mock("@/features/fares/api", () => ({ useUnitFares: () => ({ data: [] }) }));

// deno-lint-ignore no-explicit-any
const listing = {
  id: "lpt-1",
  company: { slug: "aeropark", name: "Aeropark" },
  location: { id: "loc-1", slug: "unidade-1", name: "Unidade 1", has_passenger_quantity: false, has_pcd_config: false },
  parking_type: { code: "coberto", name: "Coberto" },
} as never;

const from = new Date("2027-05-10T12:00:00Z");
const to = new Date("2027-05-13T12:00:00Z"); // 3 dias

describe("ReservationCard — cupom por query string", () => {
  beforeEach(() => {
    sessionStorage.clear();
    validateMutate.mockReset().mockResolvedValue({
      valid: true,
      discount: 30,
      subtotal: 100,
      total_preview: 70,
      code: "VOLTA10",
      error_code: null,
      discount_type: "percent",
      discount_value: 30,
    });
  });

  it("auto-aplica o cupom de ?cupom= no mount, mesmo DESLOGADO", async () => {
    renderWithProviders(<ReservationCard listing={listing} initialFrom={from} initialTo={to} />, {
      auth: mockAuth({ session: null }), // deslogado
      route: "/p/aeropark/unidade-1/coberto?cupom=volta10",
    });

    // O effect valida o cupom da URL sem exigir login.
    await waitFor(() => expect(validateMutate).toHaveBeenCalledTimes(1));
    expect(validateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VOLTA10", location_parking_type_id: "lpt-1" }),
    );
  });

  it("sem cupom na URL, não dispara validação", async () => {
    renderWithProviders(<ReservationCard listing={listing} initialFrom={from} initialTo={to} />, {
      auth: mockAuth({ session: null }),
      route: "/p/aeropark/unidade-1/coberto",
    });
    // dá tempo do effect (não) rodar
    await new Promise((r) => setTimeout(r, 50));
    expect(validateMutate).not.toHaveBeenCalled();
  });
});
