import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { getBookingIntent } from "@/lib/bookingIntent";
import { renderWithProviders, mockAuth, mockSession } from "@/test/utils";
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
const unitFares = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("@/features/fares/api", () => ({ useUnitFares: () => ({ data: unitFares.data }) }));

// deno-lint-ignore no-explicit-any
const listing = {
  id: "lpt-1",
  company: { slug: "aeropark", name: "Aeropark" },
  location: { id: "loc-1", slug: "unidade-1", name: "Unidade 1", has_passenger_quantity: false, has_pcd_config: false },
  parking_type: { code: "coberto", name: "Coberto" },
  company_parking_type: { base_price: 150 },
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

describe("ReservationCard — quem não é cliente vai pro login, não pro toast", () => {
  beforeEach(() => sessionStorage.clear());

  function Sonda() {
    const loc = useLocation();
    return <span data-testid="loc">{loc.pathname + loc.search}</span>;
  }

  it("deslogado: clicar em reservar leva ao /login com a ficha como next", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ReservationCard listing={listing} initialFrom={from} initialTo={to} />
        <Sonda />
      </>,
      { auth: mockAuth({ session: null }), route: "/p/aeropark/unidade-1/coberto" },
    );

    await user.click(screen.getByRole("button", { name: "Reservar agora" }));

    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("/login?next="));
    expect(screen.getByTestId("loc").textContent).not.toContain("trocar=1");
    // A intenção fica guardada pra retomar a reserva depois do login.
    expect(getBookingIntent()?.listingId).toBe("lpt-1");
  });

  it("operador logado: vai pro login com trocar=1, em vez de ficar sem saída", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ReservationCard listing={listing} initialFrom={from} initialTo={to} />
        <Sonda />
      </>,
      {
        auth: mockAuth({
          session: mockSession("company_operator"),
          effectiveRole: "company_operator",
        }),
        route: "/p/aeropark/unidade-1/coberto",
      },
    );

    await user.click(screen.getByRole("button", { name: "Reservar agora" }));

    await waitFor(() => expect(screen.getByTestId("loc").textContent).toContain("trocar=1"));
  });
});

// 23/09/2026: a promessa do card sai do catálogo (Manager › Tarifas), não de texto no componente.
describe("ReservationCard — tarifas lidas do catálogo", () => {
  it("janela de 12h na Flex do catálogo vira o selo do card", async () => {
    unitFares.data = [
      { tier: "basica", label: "Básica", price_cents: 0, is_popular: false, sort_order: 0, cancel_window_minutes: 720, benefits: { guaranteed_spot: true, email_confirmation: true } },
      { tier: "flex", label: "Flex", price_cents: 1290, is_popular: true, sort_order: 1, cancel_window_minutes: 720, benefits: { guaranteed_spot: true, email_confirmation: true, plate_change: true, date_change: true } },
    ];
    renderWithProviders(<ReservationCard listing={listing} initialFrom={from} initialTo={to} />, { route: "/p/x" });
    expect(await screen.findByText("Cancelamento grátis até 12h antes")).toBeInTheDocument();
    expect(screen.queryByText("Superflex")).not.toBeInTheDocument();
    unitFares.data = [];
  });
});
