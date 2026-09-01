import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingBadge, RatingStars, RatingSummary } from "./RatingStars";

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

  // Regressão da migração Lucide → Phosphor. A cheia era a mesma estrela com `fill-ink` no
  // CSS, o que funcionava no Lucide (desenho de traço) e virou nada no Phosphor, onde o peso
  // `regular` já é o contorno fechado: nota 4 desenhava exatamente igual a nota 0, e as
  // avaliações do Google saíram na BePark sem estrela cheia nenhuma.
  //
  // A asserção é sobre o GLIFO desenhado, não sobre a classe: o que quebrou foi o desenho, e
  // teste de classe passaria feliz com o bug no ar. Compara geometria sem cravar o `d` do
  // Phosphor, que muda a cada versão do pacote.
  function geometrias(container: HTMLElement): string[] {
    return [...container.querySelectorAll("svg path")].map((p) => p.getAttribute("d") ?? "");
  }

  it("desenha a estrela cheia com outro glifo, não com fill no CSS", () => {
    const { container } = render(<RatingStars value={3} />);
    const ds = geometrias(container);
    expect(ds).toHaveLength(5);

    // Duas geometrias distintas: as 3 primeiras cheias, as 2 últimas vazias.
    expect(new Set(ds).size).toBe(2);
    expect(new Set(ds.slice(0, 3)).size).toBe(1);
    expect(new Set(ds.slice(3)).size).toBe(1);
    expect(ds[0]).not.toBe(ds[4]);
  });

  it("nota cheia e nota zero não desenham a mesma coisa", () => {
    const { container: cinco } = render(<RatingStars value={5} />);
    const { container: zero } = render(<RatingStars value={0} />);
    const dCheia = geometrias(cinco);
    const dVazia = geometrias(zero);

    // Cada extremo é uniforme, e um é o oposto do outro. Com o bug, os dois arrays eram
    // idênticos e este `not.toBe` era a única linha que falhava.
    expect(new Set(dCheia).size).toBe(1);
    expect(new Set(dVazia).size).toBe(1);
    expect(dCheia[0]).not.toBe(dVazia[0]);
  });
});

describe("RatingBadge", () => {
  it("escreve o sufixo igual com e sem link", () => {
    // Regressão: cada ramo montava o sufixo por conta própria, e o de span saía sem o
    // separador ("248 avaliaçõesno Google"). Mesma prop, mesma saída nos dois.
    const { container: comLink } = render(
      <RatingBadge avg={4.6} count={248} suffix="no Google" href="#avaliacoes" />,
    );
    const { container: semLink } = render(<RatingBadge avg={4.6} count={248} suffix="no Google" />);
    expect(comLink.textContent).toBe("4,6 · 248 avaliações· no Google");
    expect(semLink.textContent).toBe(comLink.textContent);
  });

  it("sem sufixo, mostra só a nota e a contagem", () => {
    const { container } = render(<RatingBadge avg={5} count={1} />);
    expect(container.textContent).toBe("5,0 · 1 avaliação");
  });

  it("some sem avaliações", () => {
    const { container } = render(<RatingBadge avg={null} count={0} suffix="no Google" />);
    expect(container).toBeEmptyDOMElement();
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
