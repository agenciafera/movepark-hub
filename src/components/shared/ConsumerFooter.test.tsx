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

  it("o Blog aponta para a URL com barra final, que é a canônica herdada do WordPress", () => {
    // Sem a barra o worker devolve 301, e o rodapé aparece em toda página do site:
    // seria um salto de redirect em cada visita ao blog.
    renderWithProviders(<ConsumerFooter />);

    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute("href", "/blog/");
  });
});
