import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { GatewayFeeMeasured } from "@/lib/gatewayFees";

// Taxas inventadas: o repo é público.
const SCHEDULE = {
  version: 1,
  pix_bps: 80,
  card: [
    { from: 1, to: 1, bps: 250 },
    { from: 2, to: 6, bps: 300 },
    { from: 7, to: 12, bps: 350 },
  ],
  antifraud_cents: 5,
};
const MEDIDO: GatewayFeeMeasured = {
  days: 90,
  rows: [
    { method: "card", installments: 1, sales: 2, charged_cents: 20000, fee_cents: 500, fraud_cents: 10 },
    { method: "card", installments: 3, sales: 1, charged_cents: 10000, fee_cents: 340, fraud_cents: 0 },
    { method: "pix", installments: 1, sales: 4, charged_cents: 40000, fee_cents: 320, fraud_cents: 0 },
  ],
  anticipation: { payables: 3, fee_cents: 57, base_cents_month: 2850, monthly_bps: 200 },
};

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const settings = vi.hoisted(() => ({ data: {} as Record<string, string> }));
vi.mock("./api", () => ({
  useAppSettings: () => ({ data: settings.data, isLoading: false }),
  useUpdateAppSettings: () => ({ mutateAsync, isPending: false }),
  useGatewayFeeMeasured: () => ({ data: MEDIDO }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GatewayFeeScheduleSettings } from "./GatewayFeeScheduleSettings";

describe("GatewayFeeScheduleSettings", () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    settings.data = {
      gateway_fee_schedule: JSON.stringify(SCHEDULE),
      card_anticipation_rate_monthly_bps: "200",
      payout_withdrawal_fee_cents: "150",
    };
  });

  it("mostra o contratado e o medido, com faixa sem venda e divergência", () => {
    renderWithProviders(<GatewayFeeScheduleSettings />);
    expect((screen.getByLabelText("Pix (% sobre o valor)") as HTMLInputElement).value).toBe("0.80");
    expect((screen.getByLabelText("Faixa 2: taxa (%)") as HTMLInputElement).value).toBe("3.00");
    expect(within(screen.getByTestId("faixa-1")).getByText(/2,50% em 2 vendas/)).toBeInTheDocument();
    // 2x a 6x: só a venda de 3x, a 3,40%, contra 3,00% contratado
    expect(within(screen.getByTestId("faixa-2")).getByText(/diferente do contrato/)).toBeInTheDocument();
    expect(within(screen.getByTestId("faixa-3")).getByText("sem venda")).toBeInTheDocument();
    expect(screen.getByText(/2,00% ao mês em 3 parcelas/)).toBeInTheDocument();
  });

  it("sem tabela cadastrada avisa e não salva taxa vazia", async () => {
    settings.data = {};
    renderWithProviders(<GatewayFeeScheduleSettings />);
    expect(screen.getByText(/Tabela ainda não cadastrada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Taxa do Pix fora de 0% a 20%.");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("recusa faixa com buraco", async () => {
    renderWithProviders(<GatewayFeeScheduleSettings />);
    fireEvent.change(screen.getByLabelText("Faixa 2: até"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falta a parcela de 6x.");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("recusa faixa sobreposta", async () => {
    renderWithProviders(<GatewayFeeScheduleSettings />);
    fireEvent.change(screen.getByLabelText("Faixa 2: até"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A faixa que começa em 7x se sobrepõe à anterior.",
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("salva a tabela em bps e as duas taxas que já existiam", async () => {
    renderWithProviders(<GatewayFeeScheduleSettings />);
    fireEvent.change(screen.getByLabelText("Faixa 1: taxa (%)"), { target: { value: "2,6" } });
    fireEvent.change(screen.getByLabelText("Antecipação (% ao mês)"), { target: { value: "2.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        gateway_fee_schedule: JSON.stringify({
          ...SCHEDULE,
          card: [{ from: 1, to: 1, bps: 260 }, ...SCHEDULE.card.slice(1)],
        }),
        card_anticipation_rate_monthly_bps: "210",
        payout_withdrawal_fee_cents: "150",
      }),
    );
  });
});
