import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("mostra título e descrição", () => {
    render(<EmptyState title="Sem reservas" description="Comece buscando uma vaga." />);
    expect(screen.getByRole("heading", { name: "Sem reservas" })).toBeInTheDocument();
    expect(screen.getByText("Comece buscando uma vaga.")).toBeInTheDocument();
  });

  it("renderiza a ilustração quando `illustration` é passado e a marca como decorativa", () => {
    const { container } = render(
      <EmptyState title="Sem reservas" illustration="/illustrations/il-empty-reservas.svg" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/illustrations/il-empty-reservas.svg");
    // Decorativa: alt vazio (o título carrega a mensagem, o leitor de tela ignora a arte).
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("usa o ícone (não a ilustração) quando só `icon` é passado", () => {
    const { container } = render(
      <EmptyState title="Vazio" icon={<svg data-testid="custom-icon" />} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});
