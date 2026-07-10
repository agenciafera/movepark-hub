import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import SejaParceiroPage from "@/routes/seja-parceiro";

function renderPage() {
  renderWithProviders(
    <HelmetProvider>
      <SejaParceiroPage />
    </HelmetProvider>,
  );
}

describe("SejaParceiroPage — landing de parceiro", () => {
  it("mostra promessa, métricas e FAQ", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /sem pagar nada de custo fixo/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("125 mil+")).toBeInTheDocument();
    expect(screen.getByText(/Quanto custa para ser parceiro/i)).toBeInTheDocument();
  });

  it("não tem formulário inline; os CTAs abrem o modal de cadastro", async () => {
    renderPage();
    // Formulário não fica visível na página (só via modal).
    expect(screen.queryByText("Passo 1 de 3")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /Quero ser parceiro/i })[0]);

    expect(await screen.findByText("Passo 1 de 3")).toBeInTheDocument();
  });
});
