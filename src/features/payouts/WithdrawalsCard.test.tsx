import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "@/lib/supabase";
import { edge, tabela } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import { WithdrawalsCard } from "./WithdrawalsCard";

const saques = [
  {
    id: "w1", company_id: "c1", provider: "pagarme", external_transfer_id: "1", external_recipient_id: "re_1",
    amount_cents: 11060, fee_cents: 367, status: "processing", requested_at: "2026-09-17T17:30:00Z", paid_at: null,
    expected_at: "2026-09-18T02:59:00Z", gateway_status: "pending_transfer", failure_reason: null, synced_at: "2026-09-17T17:30:00Z",
    raw: null, created_at: "2026-09-17T17:30:05Z", updated_at: "2026-09-17T17:30:05Z", deleted_at: null, company: { name: "Agência Fera" },
  },
  {
    id: "w2", company_id: "c2", provider: "pagarme", external_transfer_id: "2", external_recipient_id: "re_2",
    amount_cents: 1033, fee_cents: 367, status: "failed", requested_at: "2026-09-16T12:00:00Z", paid_at: null,
    expected_at: "2026-09-17T02:59:00Z", gateway_status: "failed", failure_reason: "conta encerrada", synced_at: "2026-09-17T10:00:00Z",
    raw: null, created_at: "2026-09-16T12:00:05Z", updated_at: "2026-09-17T10:00:00Z", deleted_at: null, company: { name: "Virapark" },
  },
];

describe("WithdrawalsCard", () => {
  it("lista os saques com quando chega, a empresa e o motivo da falha", async () => {
    tabela("payout_withdrawal", "get", { json: saques });
    renderWithProviders(<WithdrawalsCard showCompany />);
    expect(await screen.findByText("Agência Fera")).toBeInTheDocument();
    expect(screen.getByText("Em trânsito")).toBeInTheDocument();
    expect(screen.getByTestId("saque-chega-w1")).toHaveTextContent(/previsto para/);
    expect(screen.getByTestId("saque-chega-w2")).toHaveTextContent("falhou: conta encerrada");
    // Sem permissão de conferir, o botão não existe.
    expect(screen.queryByRole("button", { name: "Conferir saques no gateway" })).not.toBeInTheDocument();
  });

  it("hub_admin confere no gateway agora e a lista recarrega", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "jwt" } as never },
      error: null,
    } as never);
    const lista = tabela("payout_withdrawal", "get", { json: saques });
    const conferir = edge("reconcile-payout-transfers", { json: { ok: true, checked: 0, updated: 0, withdrawals: { checked: 1, updated: 1 } } });
    renderWithProviders(<WithdrawalsCard companyId="c1" canReconcile />);
    await screen.findByText("Em trânsito");
    const antes = lista.chamadas.length;
    await userEvent.click(screen.getByRole("button", { name: "Conferir saques no gateway" }));
    await waitFor(() => expect(conferir.chamadas).toHaveLength(1));
    await waitFor(() => expect(lista.chamadas.length).toBeGreaterThan(antes));
  });
});
