import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { PayoutDebtOverviewRow } from "@/features/payouts/api";

const linhas: PayoutDebtOverviewRow[] = [
  { company_id: "c1", company_name: "Motion Park", debt_cents: 16000, debt_raw_cents: 16000, since: "2026-09-01T10:00:00Z", last_recovery_at: null },
  { company_id: "c2", company_name: "Virapark", debt_cents: 0, debt_raw_cents: -1200, since: null, last_recovery_at: "2026-09-10T10:00:00Z" },
];
const acertar = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/payouts/api", () => ({
  usePayoutDebtOverview: () => ({ data: linhas, isLoading: false }),
  useSettlePayoutDebt: () => ({ mutateAsync: acertar, isPending: false }),
}));

import { PayoutDebtCard } from "./PayoutDebtCard";

const norm = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");

describe("PayoutDebtCard", () => {
  beforeEach(() => acertar.mockClear());

  it("lista quem deve, com valor e desde quando, e oferece o acerto", () => {
    renderWithProviders(<PayoutDebtCard />);
    const linha = screen.getByText("Motion Park").closest("tr")!;
    expect(norm(linha.textContent)).toContain("R$ 160,00");
    expect(linha.querySelector("button")).not.toBeNull();
  });

  it("abatimento a mais aparece como 'A devolver', sem botão de acerto", () => {
    renderWithProviders(<PayoutDebtCard />);
    const linha = screen.getByText("Virapark").closest("tr")!;
    expect(norm(linha.textContent)).toContain("A devolver R$ 12,00");
    expect(linha.querySelector("button")).toBeNull();
  });

  it("só lança o acerto depois da confirmação, com o valor digitado em centavos", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PayoutDebtCard />);
    await user.click(screen.getByRole("button", { name: "Lançar acerto" }));
    expect(acertar).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Valor recebido (R$)"), "50,00");
    await user.type(screen.getByLabelText("Observação"), "PIX recebido");
    const botoes = screen.getAllByRole("button", { name: "Lançar acerto" });
    await user.click(botoes[botoes.length - 1]);

    await waitFor(() => expect(acertar).toHaveBeenCalledTimes(1));
    expect(acertar).toHaveBeenCalledWith({
      company_id: "c1",
      amount_cents: 5000,
      kind: "manual_payment",
      note: "PIX recebido",
    });
  });
});
