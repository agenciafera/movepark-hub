import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stepper } from "./Stepper";
import { visibleSteps } from "./checkout.logic";

describe("Stepper", () => {
  it("unidade sem adicionais não anuncia o passo, e renumera de 1 a 4", () => {
    render(<Stepper current={4} steps={visibleSteps(false)} />);

    expect(screen.queryByText("Adicionais")).toBeNull();
    expect(screen.getByText("Pagamento")).toBeInTheDocument();
    // Pagamento é o 3º da régua aqui, não o 4º: o número é a posição, não o id.
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("5")).toBeNull();
  });

  it("unidade com adicionais mostra o passo entre veículo e pagamento", () => {
    render(<Stepper current={3} steps={visibleSteps(true)} />);

    const labels = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(labels).toEqual([
      "Identificação",
      "Veículo",
      "3Adicionais",
      "4Pagamento",
      "5Confirmação",
    ]);
  });

  // Regressão: o conector era desenhado só para `id < 4`, então Pagamento e
  // Confirmação ficavam colados e o resto da régua parecia desalinhada.
  it("liga todos os passos, inclusive o último par", () => {
    const { container } = render(<Stepper current={1} steps={visibleSteps(true)} />);
    expect(container.querySelectorAll("li[aria-hidden]")).toHaveLength(4);
    // Decoração não conta como passo para quem usa leitor de tela.
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("marca o passo atual para leitor de tela", () => {
    render(<Stepper current={2} steps={visibleSteps(true)} />);
    const atual = screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current"));
    expect(atual).toHaveLength(1);
    expect(atual[0]).toHaveTextContent("Veículo");
  });
});
