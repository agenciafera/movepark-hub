import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "@/lib/supabase";
import { edge, rpc } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import { PartnerAccount } from "./PartnerAccount";

const extrato = {
  company_id: "c1",
  header: {
    recipient_status: "active",
    external_recipient_id: "re_1",
    recipient_missing: false,
    available_cents: 12849,
    waiting_cents: 0,
    transferred_cents: 2000,
    balance_synced_at: "2026-09-16T18:33:13Z",
    transfer_enabled: null,
    transfer_interval: "Monthly",
    transfer_day: 10,
    debt_cents: 2880,
  },
  movements: [
    { kind: "sale", at: "2026-09-16T18:31:51Z", booking_code: "MP-4DA019", gross_cents: 1440, fee_cents: 18, debt_recovered_cents: 0, net_cents: 1422, debt_delta_cents: 0, release_at: "2026-09-16", release_status: "released", origin: null, status: null, note: null },
    { kind: "debt", at: "2026-09-16T17:08:39Z", booking_code: "MP-95FBB5", gross_cents: -2880, fee_cents: 0, debt_recovered_cents: 0, net_cents: 0, debt_delta_cents: 2880, release_at: null, release_status: null, origin: "master", status: null, note: "cancelamento (staff)" },
    { kind: "withdrawal", at: "2026-09-10T10:00:00Z", booking_code: null, gross_cents: -5000, fee_cents: 367, debt_recovered_cents: 0, net_cents: -5367, debt_delta_cents: 0, release_at: null, release_status: null, origin: null, status: "paid", note: null },
  ],
};

function monta(props: { canWithdraw: boolean; canRefund: boolean }) {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "jwt" } as never },
    error: null,
  } as never);
  rpc("partner_account_statement", { json: extrato });
  edge("refresh-recipients", { json: { ok: true } });
  const saque = edge("recipient-withdraw", { json: { ok: true, withdrawal_id: "w1", status: "created", amount_cents: 5000, fee_cents: 367 } });
  renderWithProviders(<PartnerAccount companyId="c1" {...props} />);
  return { saque };
}

describe("PartnerAccount", () => {
  it("mostra saldo, ciclo, dívida e os movimentos com o efeito no saldo", async () => {
    monta({ canWithdraw: false, canRefund: false });
    expect(await screen.findByTestId("conta-disponivel")).toHaveTextContent("R$ 128,49");
    expect(screen.getByText("Automático, todo dia 10")).toBeInTheDocument();
    expect(screen.getByTestId("conta-divida")).toHaveTextContent("R$ 28,80");
    // formatBRL usa espaço não-quebrável entre R$ e o número; normaliza antes de comparar.
    const efeitos = screen.getAllByTestId("mov-no-saldo").map((e) => e.textContent?.replace(/\u00a0/g, " "));
    expect(efeitos).toEqual(["+R$ 14,22", "-", "−R$ 53,67"]);
    expect(screen.getByText("liberado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repassar para o banco" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Estornar" })).not.toBeInTheDocument();
  });

  it("hub_admin tem Estornar na venda e Repassar pede o saque à Edge em centavos", async () => {
    const { saque } = monta({ canWithdraw: true, canRefund: true });
    const estornar = await screen.findByRole("link", { name: "Estornar" });
    expect(estornar).toHaveAttribute("href", "/manager/bookings?q=MP-4DA019");

    await userEvent.click(screen.getByRole("button", { name: "Repassar para o banco" }));
    await userEvent.type(screen.getByLabelText("Valor"), "5000");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar saque" }));
    await waitFor(() => expect(saque.ultimoBody).toEqual({ company_id: "c1", amount_cents: 5000 }));
  });
});
