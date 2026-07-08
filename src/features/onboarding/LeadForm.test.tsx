import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { LeadForm } from "./LeadForm";

/** Dispara o submit no <form> (exercita handleSubmit sem depender da validação nativa do browser). */
function submitForm(container: HTMLElement) {
  fireEvent.submit(container.querySelector("form")!);
}

describe("LeadForm — validação inline", () => {
  it("mostra erros persistentes abaixo dos campos (telefone e termos) ao enviar vazio", () => {
    const { container } = renderWithProviders(<LeadForm onSuccess={vi.fn()} />);

    submitForm(container);

    expect(screen.getByText("Informe um telefone para contato.")).toBeInTheDocument();
    expect(screen.getByText("É necessário aceitar os termos para continuar.")).toBeInTheDocument();
    // Erros são anunciados a leitores de tela.
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(2);
  });

  it("limpa o erro de termos assim que o usuário marca o checkbox", () => {
    const { container } = renderWithProviders(<LeadForm onSuccess={vi.fn()} />);

    submitForm(container);
    expect(screen.getByText("É necessário aceitar os termos para continuar.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.queryByText("É necessário aceitar os termos para continuar."),
    ).not.toBeInTheDocument();
  });

  it("linka termos de uso e política de privacidade para as rotas reais", () => {
    renderWithProviders(<LeadForm onSuccess={vi.fn()} />);

    expect(screen.getByRole("link", { name: "termos de uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "política de privacidade" })).toHaveAttribute(
      "href",
      "/privacidade",
    );
  });
});
