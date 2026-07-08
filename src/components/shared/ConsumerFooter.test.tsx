import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ConsumerFooter } from "./ConsumerFooter";

describe("ConsumerFooter — links", () => {
  it("aponta 'Como funciona' e 'Política de cancelamento' para as rotas reais (não sob /ajuda)", () => {
    renderWithProviders(<ConsumerFooter />);

    const comoFunciona = screen.getByRole("link", { name: "Como funciona" });
    expect(comoFunciona).toHaveAttribute("href", "/como-funciona");

    const cancelamento = screen.getByRole("link", { name: "Política de cancelamento" });
    expect(cancelamento).toHaveAttribute("href", "/cancelamento");
  });
});
