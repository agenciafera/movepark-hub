import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { SocialPostSlide } from "@/types/domain";
import { PreviaStories } from "./PreviaStories";
import { AVATAR, STORY_MS, USUARIO } from "./previa.logic";

function slides(n: number): SocialPostSlide[] {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://exemplo.co/${i + 1}.jpg`,
    path: `social/confins/${i + 1}.jpg`,
    alt: `slide ${i + 1}`,
    texto: null,
  }));
}

function movimentoReduzido(reduzido: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") && reduzido,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const passar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const bar = (i: number) => screen.getByTestId(`story-barra-${i}`);

describe("PreviaStories", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    movimentoReduzido(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function montar(n = 3) {
    return render(<PreviaStories post={{ id: "p1", slides: slides(n) }} />);
  }

  it("mostra o primeiro slide, uma barrinha por slide, o usuário e a mensagem falsa", () => {
    montar(3);
    expect(screen.getByAltText("slide 1")).toHaveAttribute("src", "https://exemplo.co/1.jpg");
    expect(screen.getAllByTestId(/^story-barra-/)).toHaveLength(3);
    expect(screen.getByText(USUARIO)).toBeInTheDocument();
    expect(screen.getByText("agora")).toBeInTheDocument();
    expect(screen.getByTestId("story-avatar")).toHaveAttribute("src", AVATAR);
    expect(screen.getByText("Enviar mensagem")).toBeInTheDocument();
  });

  it("post que não vai para os stories: o selo diz que a prévia é só como ficaria", () => {
    montar();
    expect(
      screen.getByText("Este post não vai para os stories. A prévia mostra como ficaria."),
    ).toBeInTheDocument();
  });

  it("post que vai para os stories mostra as imagens 9:16 que vão sair, uma barrinha por story", () => {
    const stories = [
      { url: "https://exemplo.co/1-story.jpg", path: "social/confins/1-story.jpg" },
      { url: "https://exemplo.co/2-story.jpg", path: "social/confins/2-story.jpg" },
    ];
    render(
      <PreviaStories
        post={{ id: "p1", slides: slides(3), placements: ["feed", "story"], story_slides: stories }}
      />,
    );
    const imagem = screen.getByTestId("story-imagem");
    expect(imagem).toHaveAttribute("src", "https://exemplo.co/1-story.jpg");
    expect(imagem.className).toContain("object-cover");
    expect(screen.queryByTestId("story-fundo")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^story-barra-/)).toHaveLength(2);
    expect(
      screen.getByText("Os stories saem assim, um por slide, e ficam 24 horas no ar."),
    ).toBeInTheDocument();
  });

  it("o slide fica inteiro (contain) sobre a mesma imagem ampliada e desfocada", () => {
    montar();
    const slide = screen.getByAltText("slide 1");
    expect(slide.className).toContain("object-contain");
    expect(slide.className).toContain("aspect-[4/5]");
    const fundo = screen.getByTestId("story-fundo");
    expect(fundo).toHaveAttribute("src", "https://exemplo.co/1.jpg");
    expect(fundo).toHaveAttribute("aria-hidden", "true");
    expect(fundo.className).toContain("object-cover");
    expect(fundo.className).toContain("blur-2xl");
  });

  it("a barra do slide atual enche com o tempo, as anteriores ficam cheias e as seguintes vazias", () => {
    montar(3);
    expect(bar(0)).toHaveStyle({ width: "0%" });
    passar(STORY_MS / 2);
    expect(bar(0)).toHaveStyle({ width: "50%" });
    expect(bar(1)).toHaveStyle({ width: "0%" });

    passar(STORY_MS / 2);
    expect(bar(0)).toHaveStyle({ width: "100%" });
    expect(bar(1)).toHaveStyle({ width: "0%" });
    expect(bar(2)).toHaveStyle({ width: "0%" });
  });

  it("depois de STORY_MS mostra o segundo slide, sozinho", () => {
    montar(3);
    passar(STORY_MS - 100);
    expect(screen.getByAltText("slide 1")).toBeInTheDocument();
    passar(100);
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
    expect(screen.queryByAltText("slide 1")).not.toBeInTheDocument();
  });

  it("clicar em Próximo story avança e em Story anterior volta", () => {
    montar(3);
    fireEvent.click(screen.getByRole("button", { name: "Próximo story" }));
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próximo story" }));
    expect(screen.getByAltText("slide 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Story anterior" }));
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
  });

  it("voltar no primeiro story recomeça o primeiro", () => {
    montar(3);
    passar(2000);
    fireEvent.click(screen.getByRole("button", { name: "Story anterior" }));
    expect(screen.getByAltText("slide 1")).toBeInTheDocument();
    expect(bar(0)).toHaveStyle({ width: "0%" });
  });

  it("no último slide, depois do tempo, para no fim e aparece Rever", () => {
    montar(2);
    expect(screen.queryByRole("button", { name: "Rever" })).not.toBeInTheDocument();
    passar(STORY_MS);
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rever" })).not.toBeInTheDocument();

    passar(STORY_MS);
    expect(screen.getByRole("button", { name: "Rever" })).toBeInTheDocument();
    // Não volta ao início sozinho.
    passar(STORY_MS * 3);
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
    expect(bar(1)).toHaveStyle({ width: "100%" });
  });

  it("tocar para avançar no último slide também termina", () => {
    montar(2);
    fireEvent.click(screen.getByRole("button", { name: "Próximo story" }));
    fireEvent.click(screen.getByRole("button", { name: "Próximo story" }));
    expect(screen.getByRole("button", { name: "Rever" })).toBeInTheDocument();
  });

  it("Rever volta ao primeiro slide e retoma o tempo", () => {
    montar(2);
    passar(STORY_MS * 2);
    fireEvent.click(screen.getByRole("button", { name: "Rever" }));
    expect(screen.getByAltText("slide 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rever" })).not.toBeInTheDocument();
    passar(STORY_MS);
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
  });

  it("segurar a tela pausa, e soltar retoma", () => {
    montar(3);
    const tela = screen.getByTestId("story-tela");
    fireEvent.pointerDown(tela);
    passar(STORY_MS * 3);
    expect(screen.getByAltText("slide 1")).toBeInTheDocument();

    fireEvent.pointerUp(tela);
    passar(STORY_MS);
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
  });

  it("tirar o dedo da tela também retoma", () => {
    montar(3);
    const tela = screen.getByTestId("story-tela");
    fireEvent.pointerDown(tela);
    passar(STORY_MS * 2);
    expect(screen.getByAltText("slide 1")).toBeInTheDocument();
    fireEvent.pointerLeave(tela);
    passar(STORY_MS);
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
  });

  it("um toque longo (segurar e soltar) não conta como clique para avançar", () => {
    montar(3);
    const proximo = screen.getByRole("button", { name: "Próximo story" });
    fireEvent.pointerDown(proximo);
    passar(600);
    fireEvent.pointerUp(proximo);
    fireEvent.click(proximo);
    expect(screen.getByAltText("slide 1")).toBeInTheDocument();
  });

  it("com movimento reduzido não anda sozinho, mostra a barra cheia e avança só por clique", () => {
    movimentoReduzido(true);
    montar(3);
    passar(STORY_MS * 4);
    expect(screen.getByAltText("slide 1")).toBeInTheDocument();
    expect(bar(0)).toHaveStyle({ width: "100%" });
    expect(bar(1)).toHaveStyle({ width: "0%" });

    fireEvent.click(screen.getByRole("button", { name: "Próximo story" }));
    expect(screen.getByAltText("slide 2")).toBeInTheDocument();
  });

  it("para o relógio ao sair da aba", () => {
    const { unmount } = montar(3);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
