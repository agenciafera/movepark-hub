import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, renderWithProviders } from "@/test/utils";
import { WlBookingDetailView } from "./WlBookingDetailView";
import { useWlBookingAction, useWlBookingActions, useWlBookingDetail } from "./api";
import type { WlBookingDetailData } from "@/types/domain";

// Quem recorta é o servidor (wl_booking_detail, pgTAP wl_booking_detail). Aqui, a tela: o mesmo
// layout da reserva do Hub sem os blocos que só existem lá, a linha do tempo com quem fez, e as
// ações que o site aceita (reservas-unificadas-hub-wl.md § 4.2).
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, useWlBookingDetail: vi.fn(), useWlBookingActions: vi.fn(), useWlBookingAction: vi.fn() };
});

const RESERVA: WlBookingDetailData = {
  id: "w-1", company_id: "company-1", company_name: "Abbapark", wl_order_id: 9, wl_order_number: "271001-0001",
  wl_created_at: "2027-09-20T13:00:00Z", wl_updated_at: null, origin: "reserva-online",
  status: "confirmed", site_status: "confirmed", wl_status: "complete",
  attendance_status: "pendente", attendance_marked_at: null,
  customer_name: "Ana Souza", customer_email: "ana@ex.com", customer_phone: "11999990000",
  license_plate: "ABC1D23", check_in_at: "2020-01-01T10:00:00Z", check_out_at: "2020-01-03T10:00:00Z",
  passenger_count: 2, has_pcd: true, is_duplicate: false, total_cents: 15050, paid_total_cents: 15050,
  location_id: "loc-1", location_name: "Aeroporto Afonso Pena", location_parking_type_id: "lpt-1",
  parking_type_name: "Vaga Coberta", category_slug: null, product_slug: null,
  utm: { utm_source: "google", utm_campaign: "ferias" }, synced_at: "2027-09-20T13:10:00Z",
  actions: [
    { id: "a2", action: "license_plate", request: { license_plate: "xyz9k88", reason: "trocou de carro" }, result: "refused",
      result_code: "voucher_used", message: "Voucher já usado.", created_at: "2027-09-21T10:00:00Z", by_name: "Equipe Movepark" },
    { id: "a1", action: "attendance", request: { status: "compareceu" }, result: "ok",
      result_code: null, message: null, created_at: "2027-09-20T14:00:00Z", by_name: "Dona Alfa" },
  ],
};

function setup(opts: {
  data?: WlBookingDetailData | null;
  actions?: { enabled: boolean; attendance: boolean; license_plate: boolean };
  mutate?: ReturnType<typeof vi.fn>;
  audience?: "manager" | "operator";
}) {
  vi.mocked(useWlBookingDetail).mockReturnValue({ data: opts.data === undefined ? RESERVA : opts.data, isLoading: false } as never);
  vi.mocked(useWlBookingActions).mockReturnValue({
    data: opts.actions ?? { enabled: false, attendance: false, license_plate: false },
  } as never);
  vi.mocked(useWlBookingAction).mockReturnValue({ mutate: opts.mutate ?? vi.fn(), isPending: false } as never);
  renderWithProviders(<WlBookingDetailView id="w-1" audience={opts.audience ?? "operator"} />, {
    auth: mockAuth({ effectiveCompanyIds: ["company-1"], hasScope: () => true }),
  });
}

describe("WlBookingDetailView", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("mesmo layout do Hub: cabeçalho, card Reserva e linha do tempo, sem os blocos só do Hub", () => {
    setup({});
    expect(screen.getByRole("heading", { name: "Reserva 271001-0001" })).toBeInTheDocument();
    expect(screen.getByText("White-label")).toBeInTheDocument();
    expect(screen.getByText("Abbapark · Aeroporto Afonso Pena")).toBeInTheDocument();
    expect(screen.getByText("Vaga Coberta · PCD")).toBeInTheDocument();
    expect(screen.getByText(/150,50/)).toBeInTheDocument();
    expect(screen.getByText("google · ferias")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-site")).toHaveTextContent("cancelar ou mudar a data é pelo painel do site");
    expect(screen.queryByText(/Plano|Cancelar reserva|Valores|Comissão|Proteção de voo/)).not.toBeInTheDocument();
  });

  it("linha do tempo em ordem, com quem fez e a recusa do site", () => {
    setup({});
    const itens = screen.getByTestId("linha-do-tempo").querySelectorAll("li");
    expect(itens[0]).toHaveTextContent("Comprada no site");
    expect(itens[1]).toHaveTextContent("Chegada registrada por Dona Alfa");
    expect(itens[2]).toHaveTextContent("Não gravou: placa trocada para XYZ9K88 (trocou de carro) por Equipe Movepark. O site recusou: Voucher já usado.");
  });

  it("a hora da cópia do site só aparece no Manager", () => {
    setup({ audience: "manager" });
    expect(screen.getByText(/Copiada do site em/)).toBeInTheDocument();
  });

  it("avisa quando o site marcou o pedido como duplicado", () => {
    setup({ data: { ...RESERVA, is_duplicate: true } });
    expect(screen.getByTestId("aviso-duplicata")).toBeInTheDocument();
  });

  it("reserva que não existe ou não é da empresa", () => {
    setup({ data: null });
    expect(screen.getByText("Não achamos essa reserva")).toBeInTheDocument();
  });

  it("ações desligadas: sem card Operação", () => {
    setup({});
    expect(screen.queryByText("Operação")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /chegou|não veio|trocar placa/i })).not.toBeInTheDocument();
  });

  it("ações ligadas: marca a chegada no site, com o status do site e não o da lista", async () => {
    const mutate = vi.fn();
    setup({ data: { ...RESERVA, status: "completed" }, actions: { enabled: true, attendance: true, license_plate: true }, mutate });
    await userEvent.click(screen.getByRole("button", { name: "Cliente chegou" }));
    expect(mutate).toHaveBeenCalledWith({ action: "attendance", wlBookingId: "w-1", status: "compareceu" }, expect.anything());
    expect(screen.getByRole("button", { name: "Trocar placa" })).toBeInTheDocument();
  });

  it("antes do horário de entrada, Cliente chegou fica travado", () => {
    setup({ data: { ...RESERVA, check_in_at: "2099-01-01T10:00:00Z" }, actions: { enabled: true, attendance: true, license_plate: false } });
    expect(screen.getByRole("button", { name: "Cliente chegou" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Não veio" })).toBeEnabled();
  });

  it("sem permissão de operar (Financeiro), nenhum botão", () => {
    setup({ actions: { enabled: true, attendance: false, license_plate: false } });
    expect(screen.queryByRole("button", { name: /chegou|não veio|trocar placa/i })).not.toBeInTheDocument();
  });

  it("ficha completa: pagamento, veículo, voucher, itens, trocas de placa e o histórico do site na linha do tempo", () => {
    setup({
      data: {
        ...RESERVA,
        payment_method_name: "PIX",
        vehicle: { description: "Fiat Uno", color: "Prata" },
        voucher_url: "https://cdn.ex/v.pdf",
        is_affiliated: true,
        items: [
          { product_slug: "vaga", product_name: "Vaga coberta", is_spot: true, quantity: 1, unit_price: 130 },
          { product_slug: "seguro", product_name: "Seguro", is_spot: false, quantity: 2, unit_price: 10 },
        ],
        synced_at: "2027-09-22T00:00:00Z",
        site_events: [
          { id: "e1", kind: "history", occurred_at: "2027-09-20T13:30:00Z", actor: "Maria", note: "Voucher gerado", data: {} },
          { id: "e2", kind: "plate_change", occurred_at: "2027-09-21T09:00:00Z", actor: "Maria", note: "trocou de carro",
            data: { old_plate: "AAA1A11", new_plate: "BBB2B22" } },
        ],
        gateway_transaction_id: "tran_7",
      },
    });
    expect(screen.getByText("PIX")).toBeInTheDocument();
    expect(screen.getByText("Fiat Uno · Prata")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voucher" })).toHaveAttribute("href", "https://cdn.ex/v.pdf");
    expect(screen.getByText("Sim, comprou como afiliado")).toBeInTheDocument();
    expect(screen.getByTestId("itens")).toHaveTextContent("Seguro × 2");
    expect(screen.getByTestId("itens")).toHaveTextContent("20,00");
    expect(screen.getByTestId("trocas-de-placa")).toHaveTextContent("AAA1A11 para BBB2B22: trocou de carro");
    const linha = screen.getByTestId("linha-do-tempo");
    expect(linha).toHaveTextContent("Voucher gerado (Maria)");
    // A ação do Hub já copiada (a1, ok) sai; a recusada (a2) fica.
    expect(linha).not.toHaveTextContent("Chegada registrada por Dona Alfa");
    expect(linha).toHaveTextContent("Não gravou: placa trocada para XYZ9K88");
    // O parceiro não vê a transação do gateway, mesmo que ela chegue.
    expect(screen.queryByText("tran_7")).not.toBeInTheDocument();
  });

  it("a transação do gateway aparece para a equipe Movepark", () => {
    setup({ data: { ...RESERVA, gateway_transaction_id: "tran_7" }, audience: "manager" });
    expect(screen.getByText("tran_7")).toBeInTheDocument();
  });

  it("duplicata aponta o pedido original", () => {
    setup({ data: { ...RESERVA, is_duplicate: true, duplicate_of_id: "w-0", duplicate_of_order_number: "271001-0000" } });
    expect(screen.getByRole("link", { name: "271001-0000" })).toHaveAttribute("href", "/operator/bookings/site/w-0");
  });
});
