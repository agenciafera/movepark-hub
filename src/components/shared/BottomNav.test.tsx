import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav } from "./BottomNav";
import { mockAuth, renderWithProviders } from "@/test/utils";

describe("BottomNav (operador)", () => {
  it('o botão "Mais" abre o menu com os itens que não cabem na barra', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BottomNav variant="operator" />, {
      auth: mockAuth({ hasScope: () => true }),
      route: "/operator",
    });

    // Fora da barra, nada de Planos de cancelamento nem Configurações antes de abrir o Mais.
    expect(screen.queryByRole("link", { name: "Configurações" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mais opções" }));

    const menu = screen.getByRole("dialog");
    expect(within(menu).getByRole("link", { name: "Planos de cancelamento" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Configurações" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Repasses" })).toBeInTheDocument();
  });

  it("respeita o escopo: sem finance:read, Repasses não aparece no Mais", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BottomNav variant="operator" />, {
      auth: mockAuth({ hasScope: (s) => s !== "finance:read" }),
      route: "/operator",
    });

    await user.click(screen.getByRole("button", { name: "Mais opções" }));

    const menu = screen.getByRole("dialog");
    expect(within(menu).queryByRole("link", { name: "Repasses" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "FAQ" })).toBeInTheDocument();
  });

  it("sem nenhum escopo, os itens gateados somem da barra e do Mais", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BottomNav variant="operator" />, {
      auth: mockAuth({ hasScope: () => false }),
      route: "/operator",
    });

    expect(screen.queryByText("Preços")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    const menu = screen.getByRole("dialog");
    expect(within(menu).queryByRole("link", { name: "Promoções" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Configurações" })).toBeInTheDocument();
  });
});
