import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
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

function monta(props: { canWithdraw: boolean; canRefund: boolean; showGateway?: boolean }) {
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
  const refresh = edge("refresh-recipients", { json: { ok: true } });
  const saque = edge("recipient-withdraw", { json: { ok: true, withdrawal_id: "w1", status: "created", requested_cents: 5000, amount_cents: 4633, fee_cents: 367 } });
  renderWithProviders(<PartnerAccount companyId="c1" {...props} />);
  return { saque, refresh };
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
    // A taxa sai de dentro do valor: pediu 10,00, caem 6,33.
    expect(screen.getByTestId("saque-resumo")).toHaveTextContent("Sai do saldo: R$ 10,00");
    expect(screen.getByTestId("saque-resumo")).toHaveTextContent("cai na conta: R$ 6,33");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar saque" }));
    await waitFor(() => expect(saque.ultimoBody).toEqual({ company_id: "c1", amount_cents: 1000, force: false }));
  });

  it("Sacar o máximo pede o disponível inteiro e avisa que cai o valor menos a taxa", async () => {
    const { saque } = monta({ canWithdraw: true, canRefund: false });
    await userEvent.click(await screen.findByRole("button", { name: "Repassar para o banco" }));
    await userEvent.click(screen.getByRole("button", { name: "Sacar o máximo" }));
    expect(screen.getByTestId("saque-resumo")).toHaveTextContent("cai na conta: R$ 17,53");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar saque" }));
    await waitFor(() => expect(saque.ultimoBody).toEqual({ company_id: "c1", amount_cents: 2120, force: false }));
  });

  it("com nada disponível, Sacar o máximo fica desabilitado e o tooltip diz por quê", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "jwt" } as never },
      error: null,
    } as never);
    rpc("partner_account_statement", { json: extrato });
    // Tudo retido pelo prazo de 30 dias: liberado 0, retido 14,22.
    rpc("payout_withdrawable", {
      json: {
        company_id: "c1", release_days: 30, released_cents: 0, retained_cents: 1422, debt_cents: 0,
        withdrawn_cents: 0, gateway_available_cents: 12849, gateway_waiting_cents: 0, gateway_synced_at: null,
        recipient_status: "active", recipient_missing: false, available_cents: 0,
        withdrawal_fee_cents: 367, max_withdraw_cents: 0,
      },
    });
    edge("refresh-recipients", { json: { ok: true } });
    // hub_admin (canRefund) abre o diálogo mesmo sem disponível, por causa do force.
    renderWithProviders(<PartnerAccount companyId="c1" canWithdraw canRefund />);
    await userEvent.click(await screen.findByRole("button", { name: "Repassar para o banco" }));
    const botao = screen.getByRole("button", { name: "Sacar o máximo" });
    expect(botao).toBeDisabled();
    // Radix abre o tooltip no foco do gatilho (o span ao redor do botão desabilitado).
    await act(async () => screen.getByTestId("saque-maximo-bloqueado").focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Nada liberado ainda: cada venda libera 30 dias depois do pagamento. Retido: R$ 14,22.",
    );
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

  it("recebedor negativo no gateway acende o alerta, com a consequência certa para cada audiência", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "jwt" } as never },
      error: null,
    } as never);
    rpc("partner_account_statement", { json: { ...extrato, header: { ...extrato.header, available_cents: -1422 } } });
    rpc("payout_withdrawable", {
      json: {
        company_id: "c1", release_days: 30, released_cents: 2000, retained_cents: 0, debt_cents: 0,
        withdrawn_cents: 0, gateway_available_cents: -1422, gateway_waiting_cents: 0, gateway_synced_at: null,
        recipient_status: "active", recipient_missing: false, available_cents: 0,
        withdrawal_fee_cents: 367, max_withdraw_cents: 0,
      },
    });
    edge("refresh-recipients", { json: { ok: true } });
    const { unmount } = renderWithProviders(<PartnerAccount companyId="c1" canWithdraw={false} canRefund={false} showGateway={false} />);
    expect(await screen.findByTestId("conta-negativa")).toHaveTextContent(
      "Sua conta no gateway está negativa em R$ 14,22. As próximas vendas cobrem esse valor primeiro; até lá não há saque.",
    );
    unmount();
    renderWithProviders(<PartnerAccount companyId="c1" canWithdraw canRefund />);
    expect(await screen.findByTestId("conta-negativa")).toHaveTextContent(/saindo do saldo do master/);
  });

  it("sem saldo negativo o alerta não existe", async () => {
    monta({ canWithdraw: false, canRefund: false });
    await screen.findByTestId("conta-disponivel");
    expect(screen.queryByTestId("conta-negativa")).not.toBeInTheDocument();
  });

  it("para o parceiro (showGateway=false) não há saldo da Pagar.me, nem Atualizar saldos, nem leitura forçada", async () => {
    const { refresh } = monta({ canWithdraw: true, canRefund: false, showGateway: false });
    expect(await screen.findByTestId("conta-disponivel")).toHaveTextContent("R$ 21,20");
    expect(screen.queryByTestId("conta-gateway")).not.toBeInTheDocument();
    expect(screen.queryByText("A liberar pelo gateway")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atualizar saldos do gateway" })).not.toBeInTheDocument();
    expect(refresh.chamadas).toHaveLength(0);
  });
});
