import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, renderWithProviders } from "@/test/utils";
import OperatorBookings from "./bookings";
import { useBookingsPage } from "@/features/bookings/api";
import { useHasWl } from "@/features/companies/useHasWl";
import type { UnifiedBookingRow, WlListRow } from "@/types/domain";

// Quem recorta é o servidor (bookings_list_page, coberto no pgTAP bookings_list_page): só vê
// reserva do site quem tem white-label, e o estacionamento só vê o que virou venda. Aqui o foco é
// a tela: uma lista só, etiqueta e filtro de origem apenas para quem tem white-label, e a reserva do
// site abrindo a tela dela (reservas-unificadas-hub-wl.md § 3).
const hubMutate = vi.fn().mockResolvedValue(undefined);
const wlMutate = vi.fn().mockResolvedValue({});
const wlPerms = { data: { enabled: true, attendance: true, license_plate: true } };
vi.mock("@/features/bookings/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/bookings/api")>();
  return { ...actual, useBookingsPage: vi.fn(), useUpdateBookingStatus: () => ({ mutateAsync: hubMutate }) };
});
vi.mock("@/features/wl-bookings/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/wl-bookings/api")>();
  return { ...actual, useWlBookingActions: () => wlPerms, useWlBookingAction: () => ({ mutateAsync: wlMutate }) };
});
vi.mock("@/features/companies/useHasWl", () => ({ useHasWl: vi.fn() }));
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const RESERVA_DO_SITE: WlListRow = {
  id: "w-1",
  company_id: "company-1",
  company_name: "Abbapark",
  wl_order_number: "271001-0001",
  status: "confirmed",
  wl_status: "complete",
  site_status: "confirmed",
  origin: "reserva-online",
  check_in_at: "2027-10-02T01:00:00Z",
  check_out_at: "2027-10-05T09:30:00Z",
  license_plate: "ABC1D23",
  passenger_count: 2,
  has_pcd: false,
  total_cents: 15050,
  paid_total_cents: 15050,
  attendance_status: "pendente",
  attendance_marked_at: null,
  customer_name: "Ana Souza",
  customer_email: "ana@ex.com",
  customer_phone: "11999990000",
  wl_created_at: "2027-09-20T13:00:00Z",
  synced_at: "2027-09-20T13:10:00Z",
  location_id: "loc-1",
  location_name: "Aeroporto Afonso Pena",
  location_parking_type_id: "lpt-1",
  parking_type_name: "Vaga Coberta",
  category_slug: "aeroporto-afonso-pena",
  product_slug: "vaga-coberta",
};

const reservaHub = (code: string, origin: string | null = null) =>
  ({
    source: "hub",
    id: code,
    booking: {
      id: code, code, status: "confirmed", origin, created_at: "2026-10-08T13:07:00Z",
      check_in_at: "2026-10-10T08:30:00Z", check_out_at: "2026-10-14T01:00:00Z", total_amount: 136.5,
      price_breakdown: { days: 4, line_items: [{ kind: "parking", subtotal: 111.6 }, { kind: "fare", tier: "superflex", subtotal: 24.9 }] },
      customer_name: "Cliente " + code, location: { name: "Abbapark" },
      payments: [{ status: "paid", method: "pix", created_at: "2026-10-08T13:10:00Z" }],
      fare_extensions: [],
    },
  }) as unknown as UnifiedBookingRow;

function setup(opts: {
  hasWl: boolean;
  rows: UnifiedBookingRow[];
  total?: number;
}) {
  vi.mocked(useHasWl).mockReturnValue({ hasWl: opts.hasWl, isLoading: false });
  vi.mocked(useBookingsPage).mockReturnValue({
    data: { rows: opts.rows, total: opts.total ?? opts.rows.length, summary: undefined },
    isLoading: false,
  } as never);
  renderWithProviders(<OperatorBookings />, {
    auth: mockAuth({ effectiveCompanyIds: ["company-1"], hasScope: () => true }),
    route: "/operator/bookings",
  });
}

const site = (checkInAt?: string): UnifiedBookingRow => ({
  source: "wl",
  id: "w-1",
  wl: { ...RESERVA_DO_SITE, check_in_at: checkInAt ?? RESERVA_DO_SITE.check_in_at },
});

describe("OperatorBookings · estacionamento sem white-label", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("a tela é a de sempre: sem aba, sem etiqueta, sem filtro de origem", () => {
    setup({ hasWl: false, rows: [reservaHub("MP-PAGA"), reservaHub("MP-VIA-WL", "white_label")] });
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Origem")).not.toBeInTheDocument();
    expect(screen.queryByText("Hub")).not.toBeInTheDocument();
    expect(screen.queryByText("White-label")).not.toBeInTheDocument();
    expect(screen.getByText("MP-VIA-WL")).toBeInTheDocument();
  });

  it("pede ao servidor só o Hub e só o que virou venda", () => {
    setup({ hasWl: false, rows: [] });
    const f = vi.mocked(useBookingsPage).mock.calls[0][0];
    expect(f.source).toBe("hub");
    expect(f.partnerView).toBe(true);
    expect(f.dateField).toBe("check_in_at");
  });

  it("a coluna mostra as diárias, não o total com a proteção", () => {
    setup({ hasWl: false, rows: [reservaHub("MP-PAGA")] });
    expect(screen.getByRole("columnheader", { name: "Diárias" })).toBeInTheDocument();
    expect(screen.getByText(/111,60/)).toBeInTheDocument();
    expect(screen.queryByText(/136,50/)).not.toBeInTheDocument();
  });
});

describe("OperatorBookings · estacionamento com white-label", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("Hub e site na mesma lista, cada um com a sua etiqueta, e o filtro de origem", () => {
    setup({ hasWl: true, rows: [site(), reservaHub("MP-PAGA")] });
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("271001-0001")).toBeInTheDocument();
    expect(screen.getByText("MP-PAGA")).toBeInTheDocument();
    expect(screen.getByText("White-label")).toBeInTheDocument();
    expect(screen.getByText("Hub")).toBeInTheDocument();
    expect(screen.getByLabelText("Origem")).toBeInTheDocument();
    expect(screen.getByText("Reserva online")).toBeInTheDocument();
    expect(screen.getByText(/150,50/)).toBeInTheDocument();
  });

  it("pagina pelo servidor", async () => {
    setup({ hasWl: true, rows: [reservaHub("MP-PAGA")], total: 120 });
    expect(screen.getByText("1 a 50 de 120")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Próxima" }));
    const ultima = vi.mocked(useBookingsPage).mock.calls.at(-1)![0];
    expect(ultima.page).toBe(1);
  });

  it("a reserva do site abre a tela de detalhe dela", async () => {
    setup({ hasWl: true, rows: [site()] });
    await userEvent.click(screen.getByText("Ana Souza"));
    expect(mockNavigate).toHaveBeenCalledWith("/operator/bookings/site/w-1");
  });

  it("ação em massa: seleciona Hub e site e marca a chegada, cada um pelo seu caminho", async () => {
    hubMutate.mockClear();
    wlMutate.mockClear();
    setup({ hasWl: true, rows: [site("2020-01-01T10:00:00Z"), reservaHub("MP-PAGA")] });
    await userEvent.click(screen.getByRole("checkbox", { name: "Selecionar todas desta página" }));
    expect(screen.getByTestId("acao-em-massa")).toHaveTextContent("2 selecionadas");
    await userEvent.click(screen.getByRole("button", { name: "Cliente chegou" }));
    expect(hubMutate).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "MP-PAGA", status: "checked_in" }),
    );
    expect(wlMutate).toHaveBeenCalledWith({ action: "attendance", wlBookingId: "w-1", status: "compareceu" });
  });
});

describe("OperatorBookings · ação em massa sem permissão", () => {
  it("sem bookings:checkin nem :write, não há coluna de seleção", () => {
    vi.mocked(useHasWl).mockReturnValue({ hasWl: true, isLoading: false });
    vi.mocked(useBookingsPage).mockReturnValue({ data: { rows: [site()], total: 1, summary: undefined }, isLoading: false } as never);
    renderWithProviders(<OperatorBookings />, {
      auth: mockAuth({ effectiveCompanyIds: ["company-1"], hasScope: (s) => !s.startsWith("bookings:") }),
      route: "/operator/bookings",
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
