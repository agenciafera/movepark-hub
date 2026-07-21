import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingStars } from "./RatingStars";

describe("RatingStars", () => {
  it("como seletor, é um radiogroup nomeado com 5 radios e a nota marcada", () => {
    render(<RatingStars value={3} onChange={vi.fn()} aria-label="Sua nota" />);
    // O grupo tem nome acessível (antes o leitor de tela não sabia de que nota se tratava).
    const group = screen.getByRole("radiogroup", { name: "Sua nota" });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    // Só a estrela da nota atual fica marcada (semântica de radiogroup).
    expect(screen.getByRole("radio", { name: "3 estrelas" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "4 estrelas" })).not.toBeChecked();
  });

  it("sem onChange é só exibição, sem role de radiogroup", () => {
    render(<RatingStars value={4} />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
