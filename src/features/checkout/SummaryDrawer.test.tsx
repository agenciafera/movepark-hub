import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryDrawer } from "./SummaryDrawer";

function montar(cta?: React.ReactNode) {
  return render(
    <SummaryDrawer total={47.9} subtitle="4 dias e 10h · Tarifa Flex" cta={cta}>
      <p>Vaga Descoberta × 1</p>
    </SummaryDrawer>,
  );
}

describe("SummaryDrawer", () => {
  it("abre fechada, com o total e a linha de contexto à mostra", () => {
    montar();
    expect(screen.getByText("R$ 47,90")).toBeInTheDocument();
    expect(screen.getByText("4 dias e 10h · Tarifa Flex")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /detalhes/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("o toque na linha do total abre e fecha o painel", async () => {
    const user = userEvent.setup();
    montar();
    const toggle = screen.getByRole("button", { name: /detalhes/ });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /ocultar/ })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  /** O painel fica no DOM pra animar, então precisa sair da árvore de acessibilidade. */
  it("fechado, o painel não é anunciado por leitor de tela", async () => {
    const user = userEvent.setup();
    const { container } = montar();
    const toggle = screen.getByRole("button", { name: /detalhes/ });
    const painel = container.querySelector(`#${CSS.escape(toggle.getAttribute("aria-controls")!)}`);

    expect(painel).toHaveAttribute("aria-hidden", "true");
    await user.click(toggle);
    expect(painel).toHaveAttribute("aria-hidden", "false");
  });

  it("o fundo escuro só existe aberto, e fecha no toque", async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.queryByRole("button", { name: "Fechar detalhes" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /detalhes/ }));
    await user.click(screen.getByRole("button", { name: "Fechar detalhes" }));

    expect(screen.getByRole("button", { name: /detalhes/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("sem CTA, a gaveta é só total e detalhes", () => {
    montar();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
  });

  it("com CTA, ele fica visível mesmo com o painel fechado", () => {
    montar(<button type="button">Continuar</button>);
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
  });
});
