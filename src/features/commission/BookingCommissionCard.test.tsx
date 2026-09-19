import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setCommission = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("./api", () => ({
  useCommissionRules: () => ({
    data: [
      { id: "r1", company_id: "c1", name: "Site do Abbapark", take_rate_bps: 500, deleted_at: null },
      { id: "r2", company_id: "c2", name: "De outra empresa", take_rate_bps: 300, deleted_at: null },
    ],
  }),
  useSetBookingCommission: () => ({ mutateAsync: setCommission, isPending: false }),
}));

import { toast } from "sonner";
import { BookingCommissionCard } from "./BookingCommissionCard";

const DA_REGRA = {
  id: "b1",
  commission_channel: "Site do Abbapark",
  commission_rule_id: "r1",
  commission_take_rate_bps: 500,
  commission_fee_payer: "partner",
  commission_chargeback_bearer: "partner",
  commission_locked: false,
  attribution: { utm_source: "abbapark", clicked_at: "2026-09-10T12:00:00Z" },
};

describe("BookingCommissionCard", () => {
  beforeEach(() => {
    setCommission.mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("Manager vê canal, pacote inteiro e a prova da origem", () => {
    renderWithProviders(<BookingCommissionCard booking={DA_REGRA} companyId="c1" payments={[]} audience="manager" canFix />);
    expect(screen.getByText("Site do Abbapark")).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(screen.getByText("Estacionamento paga")).toBeInTheDocument();
    expect(screen.getByText("Estacionamento arca com tudo")).toBeInTheDocument();
    expect(screen.getByText("abbapark")).toBeInTheDocument();
  });

  it("o estacionamento vê o canal e a comissão, sem taxa, chargeback, prova nem botão", () => {
    renderWithProviders(<BookingCommissionCard booking={DA_REGRA} companyId="c1" payments={[]} audience="operator" canFix={false} />);
    expect(screen.getByText("Site do Abbapark")).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
    expect(screen.queryByText("Taxa do gateway")).not.toBeInTheDocument();
    expect(screen.queryByText("Chargeback")).not.toBeInTheDocument();
    expect(screen.queryByText("De onde o cliente veio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Corrigir canal" })).not.toBeInTheDocument();
  });

  it("reserva antiga diz que vale a comissão padrão", () => {
    renderWithProviders(<BookingCommissionCard booking={{ id: "b0" }} companyId="c1" payments={[]} audience="manager" canFix />);
    expect(screen.getByText("Movepark (busca e site)")).toBeInTheDocument();
    expect(screen.getByText(/Vale a comissão padrão da empresa/)).toBeInTheDocument();
  });

  it("reserva paga não oferece correção e explica o porquê", () => {
    renderWithProviders(
      <BookingCommissionCard booking={DA_REGRA} companyId="c1" payments={[{ status: "paid" }]} audience="manager" canFix />,
    );
    expect(screen.queryByRole("button", { name: "Corrigir canal" })).not.toBeInTheDocument();
    expect(screen.getByText(/já foi paga/)).toBeInTheDocument();
  });

  it("corrigir exige motivo, e manda reserva, regra e motivo", async () => {
    renderWithProviders(<BookingCommissionCard booking={DA_REGRA} companyId="c1" payments={[]} audience="manager" canFix />);
    fireEvent.click(screen.getByRole("button", { name: "Corrigir canal" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Corrigir canal" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(setCommission).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Motivo"), { target: { value: "atribuição errada" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Corrigir canal" }));
    await waitFor(() =>
      expect(setCommission).toHaveBeenCalledWith({ bookingId: "b1", ruleId: null, reason: "atribuição errada" }),
    );
  });
});
