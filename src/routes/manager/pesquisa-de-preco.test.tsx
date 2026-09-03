import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { PriceResearchRow } from "@/types/domain";

const { rows, decideMutate } = vi.hoisted(() => ({
  rows: { current: [] as unknown[] },
  decideMutate: vi.fn(),
}));

vi.mock("@/features/price-research/api", () => ({
  usePriceResearchPending: () => ({ data: rows.current, isLoading: false }),
  useDecidePriceResearch: () => ({ mutateAsync: decideMutate, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManagerPesquisaDePreco from "./pesquisa-de-preco";

function proposta(over: Partial<PriceResearchRow> = {}): PriceResearchRow {
  return {
    id: "r1",
    prospect_location_id: "p1",
    prospect_name: "Park Confins",
    destination_name: "Aeroporto de Confins",
    status: "pending",
    source_url: "https://exemplo.com.br/precos",
    fetched_at: "2026-11-12T10:00:00Z",
    daily_brl: 34.9,
    weekly_brl: 169.3,
    biweekly_brl: null,
    monthly_brl: null,
    evidence: "Diarias a partir de R$ 34,90 e semana fechada por R$ 169,30.",
    model: "gemini-2.5-flash",
    notes: null,
    created_at: "2026-11-12T10:00:00Z",
    atual_daily_brl: 35,
    atual_weekly_brl: 149,
    atual_biweekly_brl: null,
    atual_monthly_brl: null,
    atual_researched_at: "2026-08-29",
    ...over,
  };
}

describe("ManagerPesquisaDePreco", () => {
  beforeEach(() => {
    decideMutate.mockReset();
    decideMutate.mockResolvedValue(undefined);
    rows.current = [proposta()];
  });

  it("mostra o que está publicado ao lado do que o robô achou", () => {
    // A decisão é comparativa: dois números em telas diferentes não se comparam.
    renderWithProviders(<ManagerPesquisaDePreco />);
    expect(screen.getByText("Park Confins")).toBeInTheDocument();
    expect(screen.getByText(/pesquisado em/)).toBeInTheDocument();
    expect(screen.getByText(/Diária: R\$\s*34,90/)).toBeInTheDocument();
    expect(screen.getByText(/Diária: R\$\s*35,00/)).toBeInTheDocument();
  });

  it("mostra o trecho da página, que é a prova do número", () => {
    renderWithProviders(<ManagerPesquisaDePreco />);
    expect(
      screen.getByText("Diarias a partir de R$ 34,90 e semana fechada por R$ 169,30."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver a página lida/ })).toHaveAttribute(
      "href",
      "https://exemplo.com.br/precos",
    );
  });

  it("aplicar manda a decisão para o servidor, que é quem escreve na ficha", async () => {
    renderWithProviders(<ManagerPesquisaDePreco />);
    await userEvent.click(screen.getByLabelText("Aplicar preço de Park Confins"));
    await waitFor(() =>
      expect(decideMutate).toHaveBeenCalledWith({ id: "r1", action: "apply" }),
    );
  });

  it("recusar não aplica nada", async () => {
    renderWithProviders(<ManagerPesquisaDePreco />);
    await userEvent.click(screen.getByLabelText("Recusar proposta de Park Confins"));
    await waitFor(() =>
      expect(decideMutate).toHaveBeenCalledWith({ id: "r1", action: "reject" }),
    );
  });

  it("tentativa sem preço explica o motivo e não oferece Aplicar", () => {
    // O robô registra a falha para alguém saber que a ficha vai ficar sem preço quando
    // a validade vencer. Aplicar não faz sentido: não há número.
    rows.current = [
      proposta({
        status: "failed",
        daily_brl: null,
        weekly_brl: null,
        evidence: null,
        notes: "O robots.txt do site não libera a leitura desta página.",
      }),
    ];
    renderWithProviders(<ManagerPesquisaDePreco />);
    expect(
      screen.getByText("O robots.txt do site não libera a leitura desta página."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Aplicar preço de Park Confins")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Recusar proposta de Park Confins")).toBeInTheDocument();
  });

  it("fila vazia diz quando o robô volta, em vez de tabela sem linha", () => {
    rows.current = [];
    renderWithProviders(<ManagerPesquisaDePreco />);
    expect(screen.getByText("Nada para decidir agora")).toBeInTheDocument();
  });
});
