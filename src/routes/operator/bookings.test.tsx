import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, renderWithProviders } from "@/test/utils";
import OperatorBookings from "./bookings";
import { useBookings } from "@/features/bookings/api";
import {
  useWlBookingAction,
  useWlBookingActions,
  useWlBookings,
  useWlBookingsCount,
} from "@/features/wl-bookings/api";
import type { WlBookingRow } from "@/types/domain";

// O gate é do servidor (operator_wl_bookings exige wl-bookings:read, coberto no pgTAP
// wl_booking_operator). Aqui o foco é a tela: a aba "Pelo seu site" só aparece com escopo e
// com reserva importada, e sem ela a tela de Reservas fica igual a antes.
vi.mock("@/features/bookings/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/bookings/api")>();
  return { ...actual, useBookings: vi.fn() };
});
vi.mock("@/features/wl-bookings/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/wl-bookings/api")>();
  return {
    ...actual,
    useWlBookings: vi.fn(),
    useWlBookingsCount: vi.fn(),
    useWlBookingActions: vi.fn(),
    useWlBookingAction: vi.fn(),
  };
});

const RESERVA_DO_SITE: WlBookingRow = {
  id: "w-1",
  company_id: "company-1",
  wl_order_number: "271001-0001",
  status: "confirmed",
  wl_status: "complete",
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

function setup(opts: {
  count: number;
  canSee?: boolean;
  actions?: { enabled: boolean; attendance: boolean; license_plate: boolean };
  mutate?: ReturnType<typeof vi.fn>;
  checkInAt?: string;
}) {
  vi.mocked(useBookings).mockReturnValue({ data: [], isLoading: false } as never);
  vi.mocked(useWlBookingActions).mockReturnValue({
    data: opts.actions ?? { enabled: false, attendance: false, license_plate: false },
  } as never);
  vi.mocked(useWlBookingAction).mockReturnValue({ mutate: opts.mutate ?? vi.fn(), isPending: false } as never);
  vi.mocked(useWlBookingsCount).mockReturnValue({ data: opts.count } as never);
  vi.mocked(useWlBookings).mockReturnValue({
    data: [{ ...RESERVA_DO_SITE, check_in_at: opts.checkInAt ?? RESERVA_DO_SITE.check_in_at }],
    isLoading: false,
    error: null,
  } as never);
  const auth = mockAuth({
    effectiveCompanyIds: ["company-1"],
    hasScope: (scope) => (scope === "wl-bookings:read" ? opts.canSee !== false : true),
  });
  renderWithProviders(<OperatorBookings />, { auth, route: "/operator/bookings" });
}

describe("OperatorBookings · reservas do site do parceiro", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sem reserva do site, a tela fica como era (sem abas)", () => {
    setup({ count: 0 });
    expect(screen.queryByRole("tab", { name: "Pelo seu site" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Busca")).toBeInTheDocument();
  });

  it("sem o escopo, a aba não aparece mesmo com reserva importada", () => {
    setup({ count: 3, canSee: false });
    expect(screen.queryByRole("tab", { name: "Pelo seu site" })).not.toBeInTheDocument();
  });

  it("com escopo e reserva, mostra a aba e abre o detalhe só leitura", async () => {
    setup({ count: 1 });
    await userEvent.click(screen.getByRole("tab", { name: "Pelo seu site" }));

    expect(screen.getByText(/não entra no seu repasse/)).toBeInTheDocument();
    expect(screen.getByText("271001-0001")).toBeInTheDocument();
    expect(screen.getAllByText("Paga").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByText("Ana Souza"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Pedido 271001-0001");
    expect(screen.getByRole("dialog")).toHaveTextContent("Para cancelar ou mudar a data, use o painel do seu site");
    expect(screen.getByRole("dialog")).toHaveTextContent("11999990000");
    // Com as ações desligadas: nenhum botão, nem de cancelar (que nunca é pelo Hub).
    expect(screen.queryByRole("button", { name: /cancelar|chegou|não veio|trocar placa/i })).not.toBeInTheDocument();
  });

  it("com as ações ligadas e permissão, marca a chegada no site", async () => {
    const mutate = vi.fn();
    setup({
      count: 1,
      actions: { enabled: true, attendance: true, license_plate: true },
      mutate,
      checkInAt: "2020-01-01T10:00:00Z",
    });
    await userEvent.click(screen.getByRole("tab", { name: "Pelo seu site" }));
    await userEvent.click(screen.getByText("Ana Souza"));

    await userEvent.click(screen.getByRole("button", { name: "Cliente chegou" }));
    expect(mutate).toHaveBeenCalledWith(
      { action: "attendance", wlBookingId: "w-1", status: "compareceu" },
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "Trocar placa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it("antes do horário de entrada, Cliente chegou fica travado", async () => {
    setup({
      count: 1,
      actions: { enabled: true, attendance: true, license_plate: false },
      checkInAt: "2099-01-01T10:00:00Z",
    });
    await userEvent.click(screen.getByRole("tab", { name: "Pelo seu site" }));
    await userEvent.click(screen.getByText("Ana Souza"));
    expect(screen.getByRole("button", { name: "Cliente chegou" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Não veio" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Trocar placa" })).not.toBeInTheDocument();
  });

  it("sem permissão de operar (Financeiro), nenhum botão", async () => {
    setup({ count: 1, actions: { enabled: true, attendance: false, license_plate: false } });
    await userEvent.click(screen.getByRole("tab", { name: "Pelo seu site" }));
    await userEvent.click(screen.getByText("Ana Souza"));
    expect(screen.queryByRole("button", { name: /chegou|não veio|trocar placa/i })).not.toBeInTheDocument();
  });
});

describe("OperatorBookings · só o que virou venda, com o valor das diárias (08/10/2026)", () => {
  beforeEach(() => vi.restoreAllMocks());

  const reserva = (code: string, status: string, payments: { status: string }[]) => ({
    id: code, code, status, origin: null, created_at: "2026-10-08T13:07:00Z",
    check_in_at: "2026-10-10T08:30:00Z", check_out_at: "2026-10-14T01:00:00Z", total_amount: 136.5,
    price_breakdown: { days: 4, line_items: [{ kind: "parking", subtotal: 111.6 }, { kind: "fare", tier: "superflex", subtotal: 24.9 }] },
    customer_name: "Cliente " + code, location: { name: "Abbapark" }, payments: payments.map((p) => ({ ...p, method: "pix", created_at: "2026-10-08T13:10:00Z" })),
    fare_extensions: [],
  });

  it("esconde expirada, recusada e cancelada sem pagamento; a coluna mostra as diárias", () => {
    vi.mocked(useBookings).mockReturnValue({
      data: [
        reserva("MP-PAGA", "confirmed", [{ status: "paid" }]),
        reserva("MP-EXPIRADA", "expired", []),
        reserva("MP-RECUSADA", "cancelled", [{ status: "failed" }]),
      ],
      isLoading: false,
    } as never);
    vi.mocked(useWlBookingsCount).mockReturnValue({ data: 0 } as never);
    vi.mocked(useWlBookings).mockReturnValue({ data: [], isLoading: false, error: null } as never);
    renderWithProviders(<OperatorBookings />, { auth: mockAuth({ effectiveCompanyIds: ["company-1"], hasScope: () => true }), route: "/operator/bookings" });

    expect(screen.getByText("MP-PAGA")).toBeInTheDocument();
    expect(screen.queryByText("MP-EXPIRADA")).not.toBeInTheDocument();
    expect(screen.queryByText("MP-RECUSADA")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Diárias" })).toBeInTheDocument();
    expect(screen.getByText(/111,60/)).toBeInTheDocument();
    expect(screen.queryByText(/136,50/)).not.toBeInTheDocument();
    // O filtro pede ao banco só os status que o estacionamento vê.
    expect(vi.mocked(useBookings).mock.calls[0][0].status).toEqual(["confirmed", "checked_in", "completed", "no_show", "cancelled"]);
  });
});
