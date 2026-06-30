import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import LoginPage from "./login";
import { mockAuth, renderWithProviders } from "@/test/utils";

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
});
