import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const simulate = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const limits = vi.hoisted(() => ({ data: { max_amount_cents: 79652, max_anticipation_fee_cents: 2953 } as unknown, isLoading: false }));
vi.mock("./api", () => ({
  useAnticipationLimits: () => limits,
  useSimulateAnticipation: () => ({ mutateAsync: simulate, isPending: false }),
  useCreateAnticipation: () => ({ mutateAsync: create, isPending: false }),
  useCompanyAnticipations: () => ({ data: [] }),
}));

import { toast } from "sonner";
import { AnticipateNowDialog } from "./AnticipateNowDialog";

describe("AnticipateNowDialog (E0.3.14)", () => {
  beforeEach(() => {
    simulate.mockReset().mockResolvedValue({ amount_cents: 79652, anticipation_fee_cents: 2953, payment_date: "2026-11-16T00:00:00.000Z" });
    create.mockReset().mockResolvedValue({ id: "ba_1", status: "pending", anticipation_fee_cents: 2953, fee_borne_by: "movepark" });
    limits.data = { max_amount_cents: 79652, max_anticipation_fee_cents: 2953 };
  });

  it("mostra o máximo e preenche o valor com ele", () => {
    renderWithProviders(<AnticipateNowDialog companyId="c1" open onOpenChange={() => {}} />);
    expect(screen.getByText(/Dá para antecipar até R\$\s?796,52/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Valor a antecipar/i)).toHaveValue(796.52);
  });

  it("confirmar só aparece depois de simular, e cria com o valor simulado", async () => {
    renderWithProviders(<AnticipateNowDialog companyId="c1" open onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /Confirmar antecipação/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Simular/i }));
    await waitFor(() => expect(simulate).toHaveBeenCalledWith({ company_id: "c1", requested_cents: 79652 }));
    expect(await screen.findByText(/Taxa de R\$\s?29,53, cai em 16\/11/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar antecipação/i }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ company_id: "c1", requested_cents: 79652 }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("sem saldo a antecipar não oferece simular", () => {
    limits.data = { max_amount_cents: 0, max_anticipation_fee_cents: 0 };
    renderWithProviders(<AnticipateNowDialog companyId="c1" open onOpenChange={() => {}} />);
    expect(screen.getByText("Nada para antecipar agora.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Simular/i })).not.toBeInTheDocument();
  });
});
