import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { rpc } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import { PayoutScheduleCard } from "./PayoutScheduleCard";

describe("PayoutScheduleCard", () => {
  it("mostra a próxima data, o valor previsto e o último ciclo", async () => {
    rpc("payout_auto_forecast", {
      json: {
        company_id: "c1", enabled: true, day: 10, source: "global", next_at: "2026-10-10", forecast_cents: 14133, min_cents: 5000,
        below_min: false, recipient_status: "active", recipient_missing: false,
        last_cycle: { cycle_month: "2026-09-01", outcome: "paid", amount_cents: 4633, available_cents: 5000, ran_at: "2026-09-10T12:00:00Z", reason: null },
      },
    });
    renderWithProviders(<PayoutScheduleCard companyId="c1" partnerView />);
    expect(await screen.findByText("Próximo repasse automático")).toBeInTheDocument();
    expect(screen.getByTestId("repasse-previsto")).toHaveTextContent("R$ 141,33");
    expect(screen.getByText(/10 de out/)).toBeInTheDocument();
    expect(screen.getByText(/sem taxa para você/)).toBeInTheDocument();
    expect(screen.getByText(/Último repasse automático em 10\/09\/2026/)).toBeInTheDocument();
  });
});
