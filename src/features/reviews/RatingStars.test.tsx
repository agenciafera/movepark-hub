import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingStars, RatingSummary } from "./RatingStars";

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

describe("RatingSummary", () => {
  it("mostra a nota média grande e a contagem, rotulado pro leitor de tela", () => {
    render(<RatingSummary avg={4.8} count={248} />);
    // O bloco inteiro é um `img` com a nota por extenso; o número e as estrelas
    // ficam aria-hidden pra não repetir a nota.
    expect(
      screen.getByRole("img", { name: "Nota 4,8 de 5, 248 avaliações" }),
    ).toBeInTheDocument();
    expect(screen.getByText("4,8")).toBeInTheDocument();
    expect(screen.getByText("248 avaliações")).toBeInTheDocument();
  });

  it("some quando não há avaliações (empty state fica com o card/seção)", () => {
    const { container } = render(<RatingSummary avg={null} count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("usa singular com uma avaliação", () => {
    render(<RatingSummary avg={5} count={1} />);
    expect(screen.getByText("1 avaliação")).toBeInTheDocument();
  });
});
