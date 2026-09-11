import { describe, expect, it, vi } from "vitest";
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

  it("repasse em andamento mostra o estado, não o botão", () => {
    renderWithProviders(<PayoutTransferCard />);
    const linha = screen.getByText("Em Curso").closest("tr")!;
    expect(linha.textContent).toMatch(/em andamento/i);
    expect(linha.querySelector("button")).toBeNull();
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
});
