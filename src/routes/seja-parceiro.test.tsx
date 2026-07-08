import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import SejaParceiroPage from "@/routes/seja-parceiro";

describe("SejaParceiroPage — ordem mobile-first", () => {
  it("coloca o formulário antes dos benefícios no DOM (ação alcançável no mobile)", () => {
    renderWithProviders(
      <HelmetProvider>
        <SejaParceiroPage />
      </HelmetProvider>,
    );

    const form = screen.getByRole("heading", { name: "Comece agora" });
    const firstBenefit = screen.getByText("Mais reservas");

    // No mobile a ordem do DOM é a ordem visual: "Comece agora" (form) vem antes de "Mais reservas".
    expect(form.compareDocumentPosition(firstBenefit)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
