import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { ConsumerBottomNav } from "./ConsumerBottomNav";

describe("ConsumerBottomNav", () => {
  it('não tem "Buscar" e traz "Destinos" apontando pra /destinos', () => {
    renderWithProviders(<ConsumerBottomNav />, { auth: mockAuth({ session: null }) });

    expect(screen.queryByRole("link", { name: "Buscar" })).not.toBeInTheDocument();
    const destinos = screen.getByRole("link", { name: "Destinos" });
    expect(destinos).toHaveAttribute("href", "/destinos");
  });

  it("anônimo vê Destinos, Entrar, Parceiro e Ajuda", () => {
    renderWithProviders(<ConsumerBottomNav />, { auth: mockAuth({ session: null }) });

    expect(screen.getByRole("link", { name: "Destinos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Parceiro" })).toHaveAttribute("href", "/seja-parceiro");
    expect(screen.getByRole("link", { name: "Ajuda" })).toHaveAttribute("href", "/ajuda");
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
