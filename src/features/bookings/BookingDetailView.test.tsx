import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { mockAuth, renderWithProviders } from "@/test/utils";

const state = vi.hoisted(() => ({
  booking: null as unknown,
  trail: null as unknown,
  history: [] as unknown[],
  extraDays: null as unknown,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const updateMutate = vi.hoisted(() => vi.fn());
const byCodeArgs = vi.hoisted(() => vi.fn());
const updateArgs = vi.hoisted(() => vi.fn());
const reconcileFees = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({
  useReconcileBookingFees: () => ({ mutate: reconcileFees, isPending: false }),
  useBookingByCode: (...args: unknown[]) => {
    byCodeArgs(...args);
    return { data: state.booking, isLoading: false };
  },
  useBookingGatewayTrail: () => ({ data: state.trail, isLoading: false, isError: false }),
  useCancelBookingStaff: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateBookingStatus: (...args: unknown[]) => {
    updateArgs(...args);
    return { mutate: updateMutate, isPending: false };
  },
  useBookingHistory: () => ({ data: state.history ?? [] }),
  useExtraDaysTable: () => ({ data: state.extraDays, isLoading: false, isError: false }),
  useRecordFlightCheckout: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const voucherPdf = vi.hoisted(() => vi.fn());
vi.mock("./customerApi", () => ({
  useChangeBookingVehicle: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoucherPdf: () => ({ mutateAsync: voucherPdf, isPending: false }),
  useExtendBookingFlightDelay: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQuotePaidBookingDates: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChangePaidBookingDates: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/features/fares/api", () => ({
  useCreateFareUpgrade: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFareCatalog: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/features/payouts/api", () => ({ usePayoutReleaseDays: () => ({ data: 30 }) }));

import { BookingDetailView } from "./BookingDetailView";
import { parseExtraDaysTable } from "./extraDays.logic";

// Tabela de dias a mais da reserva do fixture (1 diária, entrada 10/10 12:00 UTC): R$ 18 por dia.
state.extraDays = parseExtraDaysTable({
  booked_days: 1,
  tolerance_minutes: 0,
  check_in_at: "2026-10-10T12:00:00Z",
  check_out_at: "2026-10-11T12:00:00Z",
  price_source: "compra",
  prices: { "1": 18, "2": 36, "3": 54, "4": 72 },
});

function booking(status: string, payments: unknown[]) {
  return {
    id: "bk-1", code: "MP-7E2482", status, check_in_at: "2026-10-10T12:00:00Z", check_out_at: "2026-10-11T12:00:00Z",
    total_amount: 30.9, created_at: "2026-09-18T17:31:00Z", updated_at: "2026-09-18T17:37:00Z",
    customer_name: "kallef alexandre", customer_phone: "+5541988149449", customer_email: "k@ex.com", customer_tax_id: null,
    fare_tier: "flex", fare_cancel_until: "2026-10-09T12:00:00Z",
    price_breakdown: { days: 1, total: 30.9, line_items: [{ kind: "parking", quantity: 1, subtotal: 18 }, { kind: "fare", name: "Flex", tier: "flex", subtotal: 12.9 }] },
    origin: "whatsapp-bot", expires_at: "2026-09-18T18:01:00Z",
    location: { name: "Agência Fera", company: { id: "c1", name: "Agência Fera" } },
    profile: { full_name: "kallef", tax_id: null },
    vehicle: { license_plate: "BAI-2J44", model: "PEUGEOT/2008", color: "Branco" },
    payments,
  };
}
const pago = {
  id: "p1", status: "paid", refunded_at: null, created_at: "2026-09-18T17:36:40Z", paid_at: "2026-09-18T17:37:26Z", method: "card",
  amount: 30.9, installments: 1, split: [{ role: "partner", amount: 1440, chargeProcessingFee: true }, { role: "movepark", amount: 1650, liable: true }],
  split_sent_to_gateway: true, debt_recovered_cents: 0, gateway_fee_cents: 117, partner_release_at: "2026-10-20T03:00:00Z",
  refunded_amount: null, refund_absorbed_by_master: false, refund_partner_cents: 0,
};
const trailPago = {
  events: [],
  payments: [{
    id: "p1", kind: "booking", method: "card", status: "paid", amount: 30.9, installments: 1, created_at: "2026-09-18T17:36:40Z",
    split: [{ role: "partner", amount: 1440, chargeProcessingFee: true }, { role: "movepark", amount: 1650, liable: true }],
    split_sent_to_gateway: true, debt_recovered_cents: 0, gateway_fee_cents: 117, partner_release_at: "2026-10-20T03:00:00Z",
    refunded_amount: null, refund_absorbed_by_master: false, refund_partner_cents: 0,
  }],
};

function abre(
  audience: "manager" | "operator" = "manager",
  hasScope: (escopo: string) => boolean = () => true,
) {
  return renderWithProviders(
    <Routes>
      <Route path="/x/:code" element={<BookingDetailView code="MP-7E2482" audience={audience} />} />
    </Routes>,
    {
      route: "/x/MP-7E2482",
      auth: mockAuth(audience === "manager" ? { effectiveRole: "hub_admin", hasScope: () => true } : { effectiveRole: "company_operator", hasScope }),
    },
  );
}

describe("BookingDetailView", () => {
  it("mostra os dois status e os valores destrinchados: cliente, estacionamento e Movepark", () => {
    state.booking = booking("confirmed", [pago]);
    state.trail = trailPago;
    abre();
    expect(screen.getByText("Reserva MP-7E2482")).toBeInTheDocument();
    expect(screen.getByText("Confirmada")).toBeInTheDocument();
    expect(screen.getByTestId("badge-pagamento")).toHaveTextContent("Pago");
    // 02/10/2026: o estado em uma frase, e a origem (Mia no WhatsApp) no card do canal.
    expect(screen.getByTestId("reserva-estado")).toHaveTextContent("Paga no cartão em");
    expect(screen.getByText("O cliente pagou")).toBeInTheDocument();
    expect(screen.getByTestId("reserva-origem-label")).toHaveTextContent("Mia no WhatsApp");
    // 04/10/2026: a forma de pagamento na ficha e a hora do pagamento na linha do tempo.
    expect(screen.getByText("Forma de pagamento")).toBeInTheDocument();
    expect(screen.getAllByText(/Cartão de crédito à vista/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("linha-do-tempo")).toHaveTextContent(/: Paga/);
    expect(screen.getByText("Estacionamento (diária)")).toBeInTheDocument();
    expect(screen.getByText("Plano Flex")).toBeInTheDocument();
    const norm = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");
    expect(norm(screen.getByTestId("valores-total").textContent)).toBe("R$ 30,90");
    expect(norm(screen.getByTestId("valores-parceiro").textContent)).toBe("R$ 13,23");
    expect(norm(screen.getByTestId("valores-movepark").textContent)).toBe("R$ 16,50");
    // 22/09/2026: a taxa está na perna do estacionamento, e o bloco da Movepark diz isso em vez de
    // deixar o líquido dela parecer "sem desconto". A data de saque sai do pagamento + prazo (30 dias).
    expect(screen.getByTestId("valores-taxa-parceiro")).toHaveTextContent("por conta do estacionamento");
    expect(screen.getByText(/libera para saque em 18\/10\/2026/)).toBeInTheDocument();
    expect(reconcileFees).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para Reservas/ })).toHaveAttribute("href", "/manager/bookings");
  });

  it("taxa ainda não apurada: o Manager pede a apuração ao abrir, e a tela diz que está apurando", () => {
    reconcileFees.mockClear();
    state.booking = booking("confirmed", [{ ...pago, gateway_fee_cents: null, partner_release_at: null }]);
    state.trail = trailPago;
    abre();
    expect(reconcileFees).toHaveBeenCalledWith("bk-1");
    expect(screen.getByText("a confirmar")).toBeInTheDocument();
    expect(screen.queryByTestId("valores-taxa-parceiro")).not.toBeInTheDocument();
  });

  it("taxa ainda não apurada: o Operator com finance:read também pede ao abrir; o balcão não", () => {
    state.booking = booking("confirmed", [{ ...pago, gateway_fee_cents: null, partner_release_at: null }]);
    state.trail = trailPago;
    reconcileFees.mockClear();
    abre("operator", (escopo) => escopo !== "finance:read");
    expect(reconcileFees).not.toHaveBeenCalled();
    reconcileFees.mockClear();
    abre("operator");
    expect(reconcileFees).toHaveBeenCalledWith("bk-1");
  });

  it("o Manager vê o botão Ver taxas numa reserva paga", () => {
    state.booking = booking("confirmed", [pago]);
    state.trail = trailPago;
    abre("manager");
    expect(screen.getByRole("button", { name: "Ver taxas" })).toBeInTheDocument();
  });

  it("o Operator com finance:read também vê o botão Ver taxas (24/11/2026)", () => {
    state.booking = booking("confirmed", [pago]);
    state.trail = trailPago;
    abre("operator");
    expect(screen.getByRole("button", { name: "Ver taxas" })).toBeInTheDocument();
  });

  it("venda à vista com cessão antiga: o Operator vê um ajuste a favor, não antecipação (MP-784999)", () => {
    state.booking = booking("confirmed", [{ ...pago, anticipation_comp_cents: 107 }]);
    state.trail = trailPago;
    abre("operator");
    const valores = screen.getByTestId("reserva-valores");
    expect(valores).toHaveTextContent("Ajuste a seu favor (Movepark)");
    expect(valores).not.toHaveTextContent(/antecipação/i);
  });

  it("o balcão (sem finance:read) não vê o botão Ver taxas", () => {
    state.booking = booking("confirmed", [pago]);
    state.trail = trailPago;
    abre("operator", (escopo) => escopo !== "finance:read");
    expect(screen.queryByRole("button", { name: "Ver taxas" })).toBeNull();
  });

  it("sem pagamento pago não há taxas a ver", () => {
    state.booking = booking("pending", []);
    state.trail = { events: [], payments: [] };
    abre("manager");
    expect(screen.queryByRole("button", { name: "Ver taxas" })).toBeNull();
  });

  it("cancelada com estorno recusado avisa e aponta para a fila manual; não oferece cancelar de novo", () => {
    state.booking = booking("cancelled", [pago]);
    state.trail = trailPago;
    abre();
    expect(screen.getByTestId("badge-pagamento")).toHaveTextContent("Devolução pendente");
    expect(screen.getByTestId("aviso-devolucao-pendente")).toHaveTextContent("o cliente ainda não recebeu");
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it("reserva em uso ou concluída não oferece cancelamento (depois do check-in não estorna)", () => {
    state.trail = trailPago;
    state.booking = booking("checked_in", [pago]);
    const { unmount } = abre();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
    unmount();
    state.booking = booking("completed", [pago]);
    abre();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it("gera o voucher na hora, no Manager e no Operator, e abre o PDF; reserva pendente não tem voucher", async () => {
    voucherPdf.mockResolvedValue({ url: "https://x/v.pdf", code: "MP-7E2482" });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    state.trail = trailPago;
    state.booking = booking("confirmed", [pago]);
    const { unmount } = abre("operator");
    fireEvent.click(screen.getByTestId("gerar-voucher"));
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("https://x/v.pdf", "_blank"));
    expect(voucherPdf).toHaveBeenCalledWith("MP-7E2482");
    unmount();
    state.booking = booking("completed", [pago]);
    const m = abre("manager");
    expect(screen.getByTestId("gerar-voucher")).toBeInTheDocument();
    m.unmount();
    state.booking = booking("pending", []);
    abre("manager");
    expect(screen.queryByTestId("gerar-voucher")).not.toBeInTheDocument();
    open.mockRestore();
  });

  it("avisa quando a janela de estorno do gateway já venceu (PIX pago há mais de 90 dias)", () => {
    state.booking = booking("confirmed", [{ ...pago, method: "pix", paid_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }]);
    state.trail = null;
    abre();
    expect(screen.getByTestId("aviso-janela-estorno")).toHaveTextContent("fila de reembolso manual");
  });

  it("Operator: vê a parte dele, sem coluna da Movepark, sem rastro do gateway, e volta para as reservas dele", () => {
    state.booking = booking("confirmed", [pago]);
    state.trail = trailPago;
    abre("operator");
    expect(screen.getByText("Sua parte")).toBeInTheDocument();
    // 08/10/2026: o destaque é o valor das diárias; a conta fecha diárias - comissão - taxa = recebe,
    // e o total cobrado com o plano vira nota de "taxas e custos da plataforma".
    const norm = (t: string | null) => (t ?? "").replace(/\u00a0/g, " ");
    expect(norm(screen.getByTestId("valores-diarias").textContent)).toBe("R$ 18,00");
    expect(norm(screen.getByTestId("valores-comissao").textContent)).toBe("−R$ 3,60");
    expect(norm(screen.getByTestId("valores-parceiro").textContent)).toBe("R$ 13,23");
    expect(norm(screen.getByTestId("valores-cliente").textContent)).toBe("O cliente pagou R$ 30,90 (cartão), já com R$ 12,90 de taxas e custos da plataforma.");
    expect(screen.queryByTestId("valores-total")).not.toBeInTheDocument();
    expect(screen.queryByText("Plano Flex")).not.toBeInTheDocument();
    expect(screen.queryByText("Valor total")).not.toBeInTheDocument();
    expect(screen.getAllByText("Valor das diárias").length).toBe(2);
    expect(screen.queryByText("Movepark")).not.toBeInTheDocument();
    expect(screen.queryByTestId("valores-movepark")).not.toBeInTheDocument();
    expect(screen.queryByText("Gateway (Pagar.me)")).not.toBeInTheDocument();
    expect(screen.queryByText("Taxa do gateway")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para Reservas/ })).toHaveAttribute("href", "/operator/bookings");
  });

  it("Operator: reserva confirmada oferece check-in e 'Não compareceu', e dispara a transição", () => {
    state.booking = booking("confirmed", [pago]);
    abre("operator");
    expect(screen.getByRole("button", { name: "Check-in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Não compareceu" }));
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ bookingId: "bk-1", status: "no_show" }), expect.anything());
  });

  it("Operator: reserva pendente só oferece confirmar (sem no-show); o Manager não tem ações de operação", () => {
    state.booking = booking("pending", []);
    const { unmount } = abre("operator");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Não compareceu" })).not.toBeInTheDocument();
    unmount();
    state.booking = booking("confirmed", [pago]);
    abre("manager");
    expect(screen.queryByRole("button", { name: "Check-in" })).not.toBeInTheDocument();
  });

  it("Operator: devolução pendente avisa que é com a Movepark, sem atalho para a fila", () => {
    state.booking = booking("cancelled", [pago]);
    abre("operator");
    expect(screen.getByTestId("aviso-devolucao-pendente")).toHaveTextContent("pendente com a equipe da Movepark");
    expect(screen.queryByRole("link", { name: /Tentar de novo/ })).not.toBeInTheDocument();
  });

  it("código que não existe mostra o vazio, com o caminho de volta", () => {
    state.booking = null;
    abre();
    expect(screen.getByText("Não achamos essa reserva")).toBeInTheDocument();
  });

  it("reserva expirada: estado explica que nada foi cobrado e o card não diz que o cliente pagou", async () => {
    state.booking = booking("expired", []);
    state.trail = { events: [], payments: [] };
    abre();
    expect(await screen.findByTestId("reserva-estado")).toHaveTextContent("Expirada sem pagamento");
    expect(screen.getByTestId("reserva-estado")).toHaveTextContent("Nada foi cobrado");
    expect(screen.queryByText("O cliente pagou")).not.toBeInTheDocument();
    expect(screen.getByText("Valor da reserva")).toBeInTheDocument();
    expect(screen.getByText("não pago: a reserva expirou")).toBeInTheDocument();
    expect(screen.getByText("não entra: a reserva não foi paga")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma, o cliente não chegou a pagar")).toBeInTheDocument();
    expect(screen.getByTestId("linha-do-tempo")).not.toHaveTextContent(/: Paga/);
  });

  // 26/11/2026: a diária ao lado do valor das diárias, e a tabela de dias a mais na reserva.
  it("Operator com finance:read vê quantas diárias e quanto cada uma", () => {
    state.booking = booking("confirmed", [pago]);
    abre("operator", () => true);
    expect(screen.getByText("1 × R$ 18,00")).toBeInTheDocument();
    expect(screen.getByTestId("dias-a-mais")).toBeInTheDocument();
  });

  it("Manager vê a diária e a tabela de dias a mais", () => {
    state.booking = booking("checked_in", [pago]);
    abre("manager");
    expect(screen.getByText("Diária")).toBeInTheDocument();
    expect(screen.getByTestId("dias-a-mais")).toBeInTheDocument();
  });

  it("sem dias a mais na reserva pendente e com a proteção de voo acionada (ela tem a própria conta)", () => {
    state.booking = booking("pending", []);
    abre("operator", () => true);
    expect(screen.queryByTestId("dias-a-mais")).not.toBeInTheDocument();
  });

  it("com a proteção de voo acionada, o excedente segue a conta dela e o card sai", () => {
    state.booking = {
      ...booking("checked_in", [pago]),
      fare_extensions: [
        { kind: "delay", old_check_out_at: "2026-10-11T12:00:00Z", new_check_out_at: "2026-10-12T12:00:00Z",
          overage_cents: 0, overage_daily_cents: 1800, actual_check_out_at: null, flight_number: "LA1" },
      ],
    };
    abre("operator", () => true);
    expect(screen.getByTestId("flight-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("dias-a-mais")).not.toBeInTheDocument();
  });

  it("vaga sem tabela de preço: o card diz isso em vez de inventar valor", () => {
    const antes = state.extraDays;
    state.extraDays = null;
    state.booking = booking("confirmed", [pago]);
    abre("operator", () => true);
    expect(screen.getByTestId("dias-a-mais")).toHaveTextContent(
      "A tabela de preço desta vaga não está disponível.",
    );
    state.extraDays = antes;
  });

  // Fase 6: a linha do tempo da reserva do Hub diz quem fez, como a do site.
  it("linha do tempo com quem fez o check-in", () => {
    state.booking = booking("checked_in", [{ id: "p", status: "paid", method: "pix", paid_at: "2026-10-01T10:05:00Z", created_at: "2026-10-01T10:00:00Z" }]);
    state.history = [
      { id: "h1", type: "status_change", created_at: "2026-10-02T10:00:00Z", actor_role: "staff", actor_name: "Equipe Movepark",
        changes: { status: { from: "confirmed", to: "checked_in" } }, amount_delta_cents: null, reason: null },
    ];
    renderWithProviders(<BookingDetailView code="MP-7E2482" audience="operator" />);
    expect(screen.getByTestId("linha-do-tempo")).toHaveTextContent("Check-in por Equipe Movepark");
    state.history = [];
  });
});

/**
 * Balcão (papel Operação, sem `finance:read`), 23/11/2026: o servidor não entrega valor de reserva
 * nem de pagamento a quem não tem o escopo, então a reserva vem pela RPC do balcão (sem preço, sem
 * split, sem taxa) e a tela não mostra dinheiro. O que o balcão precisa continua: quem é, a placa,
 * as datas, se pagou e como, o check-in e o excedente da proteção de voo que ele cobra.
 */
/** Elementos com o texto fora do card de dias a mais (o único lugar com preço para o balcão). */
function foraDoCardDeDiasAMais(re: RegExp) {
  return screen.queryAllByText(re).filter((el) => !el.closest('[data-testid="dias-a-mais"]'));
}

describe("BookingDetailView: balcão sem dinheiro", () => {
  const SEM_FINANCEIRO = (escopo: string) => escopo !== "finance:read";
  // O que a RPC do balcão devolve: a mesma forma, com os valores nulos e o pagamento sem valor.
  const semValor = (status: string) => ({
    ...booking(status, [
      { id: "p1", status: "paid", refunded_at: null, created_at: "2026-09-18T17:36:40Z", paid_at: "2026-09-18T17:37:26Z", method: "card", installments: 1 },
    ]),
    total_amount: null,
    price_breakdown: null,
  });

  it("pede a reserva e a marcação pelo caminho do balcão, e não mostra valor nem comissão", () => {
    byCodeArgs.mockClear();
    updateArgs.mockClear();
    state.booking = semValor("confirmed");
    abre("operator", SEM_FINANCEIRO);
    expect(byCodeArgs).toHaveBeenCalledWith("MP-7E2482", { counter: true, poll: false });
    expect(updateArgs).toHaveBeenCalledWith({ counter: true });
    expect(screen.queryByText("Valor das diárias")).not.toBeInTheDocument();
    expect(screen.queryByText("Valor total")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reserva-valores")).not.toBeInTheDocument();
    expect(screen.queryByTestId("valores-diarias")).not.toBeInTheDocument();
    expect(screen.queryByTestId("valores-comissao")).not.toBeInTheDocument();
    // Desde 26/11/2026 o único R$ da tela do balcão é preço de TABELA, no card de dias a mais.
    expect(foraDoCardDeDiasAMais(/R\$/)).toHaveLength(0);
  });

  it("vê a tabela de dias a mais, porque é o balcão quem cobra a diferença no portão", () => {
    state.booking = semValor("checked_in");
    abre("operator", SEM_FINANCEIRO);
    const card = screen.getByTestId("dias-a-mais");
    expect(card).toHaveTextContent("Dias a mais");
    expect(card).toHaveTextContent("tabela de preço do dia da compra");
    // Saída real dois dias depois: 3 diárias pela tabela, contra 1 reservada.
    fireEvent.change(screen.getByLabelText("Saída real"), { target: { value: "2026-10-12T12:30" } });
    expect(screen.getByTestId("dias-a-mais-cobrar").textContent?.replace(/\u00a0/g, " ")).toBe(
      "2 diárias a mais: cobrar R$ 36,00",
    );
    expect(card).toHaveTextContent("reservada");
    expect(card).toHaveTextContent("+1 dia");
    // Parte 2 (26/11/2026): depois da entrada, a Operação cobra os dias a mais pelo Hub.
    expect(screen.getByRole("button", { name: "Cobrar pelo Hub" })).toBeInTheDocument();
  });

  it("sem bookings:write, o card só informa: não cobra pelo Hub", () => {
    state.booking = semValor("checked_in");
    abre("operator", (e: string) => e === "bookings:read");
    fireEvent.change(screen.getByLabelText("Saída real"), { target: { value: "2026-10-12T12:30" } });
    expect(screen.getByTestId("dias-a-mais-cobrar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cobrar pelo Hub" })).not.toBeInTheDocument();
  });

  it("com a saída já registrada, não estende mais", () => {
    state.booking = { ...semValor("completed"), checked_out_at: "2026-10-12T13:00:00Z" };
    abre("operator", SEM_FINANCEIRO);
    fireEvent.change(screen.getByLabelText("Saída real"), { target: { value: "2026-10-12T12:30" } });
    expect(screen.queryByRole("button", { name: "Cobrar pelo Hub" })).not.toBeInTheDocument();
  });

  it("o que o balcão precisa segue na tela: cliente, placa, pagamento e as operações", () => {
    state.booking = semValor("confirmed");
    abre("operator", SEM_FINANCEIRO);
    expect(screen.getByText("Reserva MP-7E2482")).toBeInTheDocument();
    expect(screen.getByText(/BAI-2J44/)).toBeInTheDocument();
    expect(screen.getByTestId("badge-pagamento")).toHaveTextContent("Pago");
    expect(screen.getByText("Forma de pagamento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check-in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Não compareceu" })).toBeInTheDocument();
  });

  it("reserva cancelada e devolvida: o estado não cita cifra", () => {
    state.booking = {
      ...semValor("cancelled"),
      payments: [
        { id: "p1", status: "refunded", refunded_at: "2026-09-19T10:00:00Z", created_at: "2026-09-18T17:36:40Z", paid_at: "2026-09-18T17:37:26Z", method: "card", installments: 1 },
      ],
    };
    abre("operator", SEM_FINANCEIRO);
    expect(screen.getByTestId("reserva-estado")).toHaveTextContent("O pagamento foi devolvido ao cliente");
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    // Cancelada não tem saída para cobrar: o card de dias a mais nem aparece.
    expect(screen.queryByTestId("dias-a-mais")).not.toBeInTheDocument();
  });

  it("Gerente, Financeiro e Dono (com finance:read) seguem vendo os valores", () => {
    byCodeArgs.mockClear();
    state.booking = booking("confirmed", [pago]);
    abre("operator", () => true);
    expect(byCodeArgs).toHaveBeenCalledWith("MP-7E2482", { counter: false, poll: false });
    expect(screen.getAllByText("Valor das diárias").length).toBeGreaterThan(0);
    expect(screen.getByTestId("reserva-valores")).toBeInTheDocument();
  });
});


// Ações do cliente no painel (26/11/2026): a equipe altera datas e faz upgrade até a entrada, e a
// tela espelha o escopo de cada papel.
describe("BookingDetailView: alterar a reserva pelo cliente", () => {
  const futura = (tier: string) => ({
    ...booking("confirmed", [pago]),
    check_in_at: "2099-12-10T12:00:00Z",
    check_out_at: "2099-12-12T12:00:00Z",
    fare_tier: tier,
  });
  const escopos = (lista: string[]) => (e: string) => lista.includes(e);

  it("Operação (bookings:write) vê Alterar datas e o upgrade para o plano acima", () => {
    state.booking = futura("flex");
    state.trail = trailPago;
    abre("operator", escopos(["bookings:read", "bookings:write", "bookings:cancel", "bookings:checkin"]));
    const card = screen.getByTestId("alterar-reserva");
    expect(card).toHaveTextContent("Alterar reserva");
    expect(screen.getByRole("button", { name: "Alterar datas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fazer upgrade" })).toBeInTheDocument();
    expect(card).not.toHaveTextContent("upgrade para o Flex");
  });

  it("na Básica, a tela avisa que alterar datas inclui o upgrade para o Flex", () => {
    state.booking = futura("basica");
    abre("operator", escopos(["bookings:write"]));
    expect(screen.getByTestId("alterar-reserva")).toHaveTextContent("alterar datas inclui o upgrade para o Flex");
  });

  it("Superflex não tem para onde subir: só Alterar datas", () => {
    state.booking = futura("superflex");
    abre("operator", escopos(["bookings:write"]));
    expect(screen.getByRole("button", { name: "Alterar datas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fazer upgrade" })).not.toBeInTheDocument();
  });

  it("Financeiro (só leitura de reservas) não altera, não troca placa e não cancela", () => {
    state.booking = futura("flex");
    abre("operator", escopos(["bookings:read", "finance:read", "finance:write"]));
    expect(screen.queryByTestId("alterar-reserva")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trocar placa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it("depois do horário de entrada, o card sai (a troca é até o check-in)", () => {
    state.booking = { ...futura("flex"), check_in_at: "2020-01-01T12:00:00Z", check_out_at: "2020-01-03T12:00:00Z" };
    abre("operator", escopos(["bookings:write"]));
    expect(screen.queryByTestId("alterar-reserva")).not.toBeInTheDocument();
  });

  it("o Manager vê o mesmo card", () => {
    state.booking = futura("basica");
    abre("manager");
    expect(screen.getByTestId("alterar-reserva")).toBeInTheDocument();
  });
});
