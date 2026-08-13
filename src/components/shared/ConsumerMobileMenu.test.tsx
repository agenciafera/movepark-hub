import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { ConsumerMobileMenu } from "./ConsumerMobileMenu";

/**
 * O menu existe porque a barra inferior saiu para quem não tem sessão: ela
 * alterna entre áreas de conta, e o visitante não tem nenhuma.
 */
describe("ConsumerMobileMenu", () => {
  it("abre pelo botão do canto e lista os links principais", async () => {
    renderWithProviders(<ConsumerMobileMenu />);

    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const destinos = ["/destinos", "/como-funciona", "/blog/", "/ajuda", "/seja-parceiro"];
    for (const href of destinos) {
      expect(screen.getByRole("link", { name: rotuloDe(href) })).toHaveAttribute("href", href);
    }
  });

  /** Sem sessão o "Entrar" saiu do header no mobile: ele mora aqui dentro. */
  it("leva o Entrar, que saiu do header no mobile", async () => {
    renderWithProviders(<ConsumerMobileMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
  });

  /** Só no mobile: no tablet para cima os mesmos destinos já estão no header. */
  it("o gatilho não aparece a partir do tablet", () => {
    renderWithProviders(<ConsumerMobileMenu />);
    expect(screen.getByRole("button", { name: "Abrir menu" }).className).toContain("tablet:hidden");
  });
});

function rotuloDe(href: string) {
  return {
    "/destinos": "Destinos",
    "/como-funciona": "Como funciona",
    "/blog/": "Blog",
    "/ajuda": "Ajuda",
    "/seja-parceiro": "Seja parceiro",
  }[href]!;
}
