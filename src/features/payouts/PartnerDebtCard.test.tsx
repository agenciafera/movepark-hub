import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { PayoutDebtLines } from "@/features/payouts/api";

let dados: PayoutDebtLines = {
  debt_cents: 8000,
  debt_raw_cents: 8000,
  origins: [{ booking_code: "MP-CANCEL", at: "2026-09-02T10:00:00Z", reason: "cancelamento (customer)", cents: 16000 }],
  recoveries: [{ booking_code: "MP-NOVA", at: "2026-09-05T10:00:00Z", cents: 8000, status: "paid" }],
  settlements: [],
};

vi.mock("@/features/payouts/api", () => ({
  usePayoutDebtLines: () => ({ data: dados, isLoading: false }),
}));

import { PartnerDebtCard } from "./PartnerDebtCard";

const norm = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");

describe("PartnerDebtCard", () => {
  it("explica a dívida: quanto falta, de onde veio e o que cada reserva abateu", () => {
    renderWithProviders(<PartnerDebtCard companyId="c1" />);
    expect(norm(screen.getByText(/a acertar/).textContent)).toContain("R$ 80,00");
    const origem = screen.getByText("MP-CANCEL").closest("tr")!;
    expect(norm(origem.textContent)).toContain("+R$ 160,00");
    expect(origem.textContent).toContain("cancelamento (customer)");
    const abatimento = screen.getByText("MP-NOVA").closest("tr")!;
    expect(norm(abatimento.textContent)).toContain("−R$ 80,00");
  });

  it("sem dívida e sem histórico não renderiza nada", () => {
    dados = { debt_cents: 0, debt_raw_cents: 0, origins: [], recoveries: [], settlements: [] };
    const { container } = renderWithProviders(<PartnerDebtCard companyId="c1" />);
    expect(container.textContent).toBe("");
  });
});
