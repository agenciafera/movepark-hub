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
  rpc("payout_withdrawable", {
    json: {
      company_id: "c1", release_days: 30, released_cents: 5000, retained_cents: 1422, debt_cents: 2880,
      withdrawn_cents: 0, gateway_available_cents: 12849, gateway_waiting_cents: 0, gateway_synced_at: "2026-09-16T18:33:13Z",
      recipient_status: "active", recipient_missing: false, available_cents: 2120,
      withdrawal_fee_cents: 367, max_withdraw_cents: 2120,
    },
  });
  edge("refresh-recipients", { json: { ok: true } });
  const saque = edge("recipient-withdraw", { json: { ok: true, withdrawal_id: "w1", status: "created", amount_cents: 5000, fee_cents: 367 } });
  renderWithProviders(<PartnerAccount companyId="c1" {...props} />);
  return { saque };
}

describe("PartnerAccount", () => {
  it("mostra saldo, ciclo, dívida e os movimentos com o efeito no saldo", async () => {
    monta({ canWithdraw: false, canRefund: false });
    // O disponível é o NOSSO (liberado − dívida − saques, no teto do gateway), não o saldo bruto.
    expect(await screen.findByTestId("conta-disponivel")).toHaveTextContent("R$ 21,20");
    expect(screen.getByTestId("conta-retido")).toHaveTextContent("R$ 14,22");
    expect(screen.getByText(/cada venda libera 30 dias/)).toBeInTheDocument();
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
    // A taxa aparece antes de confirmar, mas NÃO é descontada do disponível (é cobrada no saque).
    expect(screen.getByTestId("saque-taxa")).toHaveTextContent("3,67");
    expect(screen.getByTestId("saque-disponivel")).toHaveTextContent("21,20");
    await userEvent.type(screen.getByLabelText("Valor a sacar"), "1000");
    expect(screen.getByTestId("saque-resumo")).toHaveTextContent("Cai na conta: R$ 10,00");
    expect(screen.getByTestId("saque-resumo")).toHaveTextContent("taxa cobrada do saldo no saque: R$ 3,67");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar saque" }));
    await waitFor(() => expect(saque.ultimoBody).toEqual({ company_id: "c1", amount_cents: 1000, force: false }));
  });

  it("Sacar o máximo preenche o disponível inteiro; a taxa vem depois, do saldo", async () => {
    const { saque } = monta({ canWithdraw: true, canRefund: false });
    await userEvent.click(await screen.findByRole("button", { name: "Repassar para o banco" }));
    await userEvent.click(screen.getByRole("button", { name: "Sacar o máximo" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar saque" }));
    await waitFor(() => expect(saque.ultimoBody).toEqual({ company_id: "c1", amount_cents: 2120, force: false }));
  });

  it("acima do disponível nosso o saque não sai; hub_admin passa só marcando o force", async () => {
    const { saque } = monta({ canWithdraw: true, canRefund: true });
    await userEvent.click(await screen.findByRole("button", { name: "Repassar para o banco" }));
    await userEvent.type(screen.getByLabelText("Valor a sacar"), "5000");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar saque" }));
    expect(saque.chamadas).toHaveLength(0);
    await userEvent.click(screen.getByRole("checkbox", { name: "Passar do teto" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar saque" }));
    await waitFor(() => expect(saque.ultimoBody).toEqual({ company_id: "c1", amount_cents: 5000, force: true }));
  });
});
