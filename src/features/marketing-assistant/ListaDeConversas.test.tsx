import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ListaDeConversas } from "./ListaDeConversas";

const conversas = [
  { id: "a", titulo: "Volta 90 dias", atualizada_em: "2026-11-26T12:00:00Z" },
  { id: "b", titulo: "", atualizada_em: "2026-11-25T12:00:00Z" },
];

function desenhar(over: Partial<React.ComponentProps<typeof ListaDeConversas>> = {}) {
  const props = {
    conversas,
    ativaId: "a",
    onNova: vi.fn(),
    onAbrir: vi.fn(),
    onRenomear: vi.fn(),
    onApagar: vi.fn(),
    ...over,
  };
  render(<ListaDeConversas {...props} />);
  return props;
}

describe("ListaDeConversas", () => {
  it("lista com título, e conversa sem título ganha nome provisório", () => {
    desenhar();
    expect(screen.getByText("Volta 90 dias")).toBeInTheDocument();
    expect(screen.getByText("Conversa sem título")).toBeInTheDocument();
  });

  it("nova conversa e abrir chamam os callbacks", () => {
    const p = desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
    fireEvent.click(screen.getByText("Conversa sem título"));
    expect(p.onNova).toHaveBeenCalled();
    expect(p.onAbrir).toHaveBeenCalledWith("b");
  });

  it("renomeia no lugar com Enter e cancela com Esc", () => {
    const p = desenhar();
    fireEvent.click(screen.getAllByRole("button", { name: "Renomear" })[0]);
    const campo = screen.getByRole("textbox", { name: "Novo título" });
    fireEvent.change(campo, { target: { value: "Sumidos de Confins" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(p.onRenomear).toHaveBeenCalledWith("a", "Sumidos de Confins");
    expect(p.onRenomear).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Renomear" })[0]);
    const deNovo = screen.getByRole("textbox", { name: "Novo título" });
    fireEvent.change(deNovo, { target: { value: "Outro nome" } });
    fireEvent.keyDown(deNovo, { key: "Escape" });
    fireEvent.blur(deNovo);
    expect(screen.queryByRole("textbox", { name: "Novo título" })).toBeNull();
    expect(p.onRenomear).toHaveBeenCalledTimes(1);
  });

  it("apagar pede confirmação antes", () => {
    const p = desenhar();
    fireEvent.click(screen.getAllByRole("button", { name: "Apagar" })[0]);
    expect(p.onApagar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apagar conversa" }));
    expect(p.onApagar).toHaveBeenCalledWith("a");
  });
});
