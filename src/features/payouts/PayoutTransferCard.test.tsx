import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { PayoutOwedRow } from "@/features/payouts/api";

const linhas: PayoutOwedRow[] = [
  {
    company_id: "c1",
    company_name: "Agência Fera",
    owed_cents: 7650,
    transferred_cents: 0,
    available_cents: 7650,
    target_recipient_id: "re_parceiro",
    recipient_status: "active",
    em_andamento: false,
    overpaid_cents: 0,
  },
  {
    company_id: "c2",
    company_name: "Sem Recebedor",
    owed_cents: 5000,
    transferred_cents: 0,
    available_cents: 5000,
    target_recipient_id: null,
    recipient_status: null,
    em_andamento: false,
    overpaid_cents: 0,
  },
  {
    company_id: "c3",
    company_name: "Em Curso",
    owed_cents: 3000,
    transferred_cents: 3000,
    available_cents: 0,
    target_recipient_id: "re_c3",
    recipient_status: "active",
    em_andamento: true,
    overpaid_cents: 0,
    pendente: {
      id: "t3",
      status: "processing",
      amount_cents: 3000,
      enviado: true,
      failed_reason: null,
      requested_at: "2026-09-15T12:00:00Z",
    },
  },
  {
    company_id: "c4",
    company_name: "Travado",
    owed_cents: 4000,
    transferred_cents: 4000,
    available_cents: 0,
    target_recipient_id: "re_c4",
    recipient_status: "active",
    em_andamento: true,
    overpaid_cents: 0,
    pendente: {
      id: "t4",
      status: "created",
      amount_cents: 4000,
      enviado: false,
      failed_reason: "incerto HTTP 504",
      requested_at: "2026-09-15T12:00:00Z",
    },
  },
  {
    company_id: "c5",
    company_name: "Pagou A Mais",
    owed_cents: 0,
    transferred_cents: 9000,
    available_cents: 0,
    overpaid_cents: 9000,
    target_recipient_id: "re_c5",
    recipient_status: "active",
    em_andamento: false,
    pendente: null,
  },
];

const repassar = vi.fn().mockResolvedValue({ ok: true });

// formatBRL usa espaço não separável entre "R$" e o número. O Testing Library normaliza isso nos
// matchers de texto, mas comparação crua de textContent não, então normalizamos aqui.
const norm = (s: string) => s.replace(/\u00a0/g, " ");

vi.mock("@/features/payouts/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePayoutOwed: () => ({ data: linhas, isLoading: false }),
  useRequestPayoutTransfer: () => ({ mutateAsync: repassar, isPending: false }),
}));

import { PayoutTransferCard } from "./PayoutTransferCard";

describe("PayoutTransferCard", () => {
  // O spy é do módulo: sem limpar, a chamada de um teste vaza para o "não chamou" do seguinte.
  beforeEach(() => repassar.mockClear());

  it("lista quem está devendo, com o valor devido", () => {
    renderWithProviders(<PayoutTransferCard />);
    expect(screen.getByText("Agência Fera")).toBeInTheDocument();
    // aparece em duas colunas da linha: o devido e o que cabe repassar
    expect(screen.getAllByText("R$ 76,50").length).toBe(2);
  });

  it("não oferece repasse para quem não tem recebedor apto", () => {
    renderWithProviders(<PayoutTransferCard />);
    const linha = screen.getByText("Sem Recebedor").closest("tr")!;
    expect(linha.textContent).toMatch(/sem recebedor/i);
    expect(linha.querySelector("button")).toBeNull();
  });

  it("repasse já no gateway mostra que aguarda, sem botão", () => {
    renderWithProviders(<PayoutTransferCard />);
    const linha = screen.getByText("Em Curso").closest("tr")!;
    expect(linha.textContent).toMatch(/aguardando o gateway/i);
    expect(linha.querySelector("button")).toBeNull();
  });

  it("repasse que não chegou ao gateway oferece retomar, com o valor pendente", async () => {
    // Achado da varredura de 15/09/2026: a linha que caiu em resposta incerta ficava sem caminho,
    // porque a tela escondia o botão sempre que havia repasse em andamento.
    const user = userEvent.setup();
    renderWithProviders(<PayoutTransferCard />);
    const linha = screen.getByText("Travado").closest("tr")!;
    const botao = linha.querySelector("button")!;
    expect(botao.textContent).toMatch(/retomar/i);

    await user.click(botao);
    const dialogo = await screen.findByRole("dialog");
    expect(norm(dialogo.textContent ?? "")).toContain("R$ 40,00");
    expect(norm(dialogo.textContent ?? "")).toMatch(/mesma chave|não duplica/i);

    await user.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() =>
      expect(repassar).toHaveBeenCalledWith({ company_id: "c4", amount_cents: 4000 }),
    );
  });

  it("só dispara o repasse depois da confirmação, com empresa, destino e valor na tela", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PayoutTransferCard />);

    await user.click(screen.getByRole("button", { name: /repassar/i }));

    // O diálogo mostra o que está prestes a sair, antes de sair.
    const dialogo = await screen.findByRole("dialog");
    expect(norm(dialogo.textContent ?? "")).toContain("Agência Fera");
    expect(norm(dialogo.textContent ?? "")).toContain("re_parceiro");
    expect(norm(dialogo.textContent ?? "")).toContain("R$ 76,50");
    // Abrir o diálogo não move dinheiro.
    expect(repassar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmar repasse/i }));
    await waitFor(() =>
      expect(repassar).toHaveBeenCalledWith({ company_id: "c1", amount_cents: 7650 }),
    );
  });

  it("mostra o que foi repassado a mais, em vez de sumir no zero", () => {
    // Estorno depois do repasse derrubava o devido, o repassado continuava lá, e a diferença
    // desaparecia no `greatest(..., 0)`. Sem número na tela, ninguém cobra.
    renderWithProviders(<PayoutTransferCard />);
    const linha = screen.getByText("Pagou A Mais").closest("tr")!;
    expect(norm(linha.textContent ?? "")).toContain("R$ 90,00");
    expect(linha.textContent).toMatch(/a recuperar/i);
    expect(linha.querySelector("button")).toBeNull();
  });
});
