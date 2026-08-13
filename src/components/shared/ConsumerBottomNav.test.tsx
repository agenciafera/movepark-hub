import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { ConsumerBottomNav } from "./ConsumerBottomNav";

describe("ConsumerBottomNav", () => {
  it('não tem "Buscar" e traz "Destinos" apontando pra /destinos', () => {
    renderWithProviders(<ConsumerBottomNav />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });

    expect(screen.queryByRole("link", { name: "Buscar" })).not.toBeInTheDocument();
    const destinos = screen.getByRole("link", { name: "Destinos" });
    expect(destinos).toHaveAttribute("href", "/destinos");
  });

  /**
   * Quem monta e desmonta a barra é o `ConsumerAppShell`, e ela só existe com
   * sessão: os quatro alvos são de conta. Antes dois deles viravam "Entrar" e
   * "Parceiro", ou seja, 64px fixos de tela pequena para oferecer o que o header
   * já oferecia.
   */
  it("os quatro alvos são de quem já tem conta", () => {
    renderWithProviders(<ConsumerBottomNav />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });

    expect(screen.getByRole("link", { name: "Destinos" })).toHaveAttribute("href", "/destinos");
    expect(screen.getByRole("link", { name: "Reservas" })).toHaveAttribute("href", "/bookings");
    expect(screen.getByRole("link", { name: "Conta" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("link", { name: "Ajuda" })).toHaveAttribute("href", "/ajuda");
    expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Parceiro" })).not.toBeInTheDocument();
  });

  it("tem folga inferior que respeita a safe area (não gruda na borda de baixo)", () => {
    const { container } = renderWithProviders(<ConsumerBottomNav />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    const nav = container.querySelector("nav");
    // max(0.5rem, safe): folga mínima em aparelho sem recorte + safe-area onde existe.
    expect(nav?.className).toContain("pb-[max(0.5rem,var(--safe-bottom))]");
  });

  /**
   * A seleção era só o texto trocar de cinza pra preto, diferença fraca demais numa
   * barra de 4 alvos vista na mão. O traço violeta no topo é o sinal principal.
   */
  it("marca a aba atual com um traço, e só ela", () => {
    renderWithProviders(<ConsumerBottomNav />, {
      auth: mockAuth({ session: mockSession("customer") }),
      route: "/account",
    });

    const tracos = screen.getAllByTestId(/^tab-indicator-/);
    expect(tracos).toHaveLength(1);
    expect(tracos[0]).toHaveAttribute("data-testid", "tab-indicator-Conta");
    expect(tracos[0].className).toContain("bg-mp-primary");
    // Decoração: o leitor de tela já sabe a página atual pelo aria-current do link.
    expect(tracos[0]).toHaveAttribute("aria-hidden");
    expect(screen.getByRole("link", { name: "Conta" })).toHaveAttribute("aria-current", "page");
  });

  it("fora das rotas da barra, nenhuma aba fica marcada", () => {
    renderWithProviders(<ConsumerBottomNav />, {
      auth: mockAuth({ session: mockSession("customer") }),
      route: "/p/virapark/virapark/covered",
    });
    expect(screen.queryAllByTestId(/^tab-indicator-/)).toHaveLength(0);
  });

  it("logado troca Entrar/Parceiro por Reservas/Conta, mantendo Destinos e Ajuda", () => {
    renderWithProviders(<ConsumerBottomNav />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });

    expect(screen.getByRole("link", { name: "Destinos" })).toHaveAttribute("href", "/destinos");
    expect(screen.getByRole("link", { name: "Reservas" })).toHaveAttribute("href", "/bookings");
    expect(screen.getByRole("link", { name: "Conta" })).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("link", { name: "Buscar" })).not.toBeInTheDocument();
  });
});
