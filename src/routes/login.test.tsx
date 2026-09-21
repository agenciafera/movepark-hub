import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import LoginPage from "./login";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";

describe("LoginPage", () => {
  it("oferece saída para a home (logo + link de voltar) no estado inicial", () => {
    renderWithProviders(<LoginPage />, {
      auth: mockAuth({ session: null, effectiveRole: null }),
      route: "/login",
    });

    // Link explícito de voltar.
    const voltar = screen.getByRole("link", { name: /voltar para o início/i });
    expect(voltar).toHaveAttribute("href", "/");

    // Wordmark também leva pra home.
    const brand = screen.getByRole("link", { name: /página inicial da movepark/i });
    expect(brand).toHaveAttribute("href", "/");
  });

  it("com trocar=1, conta que não reserva fica na tela e entende o porquê", () => {
    renderWithProviders(<LoginPage />, {
      auth: mockAuth({
        session: mockSession("company_operator", { email: "peu+mercy@fera.ag" }),
        effectiveRole: "company_operator",
      }),
      route: "/login?next=%2Fp%2Faeropark%2Funidade-1%2Fcoberto&trocar=1",
    });

    // Sem o aviso, o efeito de "já logado" devolveria a pessoa pro next sem explicação.
    expect(screen.getByText(/peu\+mercy@fera\.ag/)).toBeInTheDocument();
    expect(screen.getByText(/não faz reservas/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar com e-mail/i })).toBeInTheDocument();
  });
});
