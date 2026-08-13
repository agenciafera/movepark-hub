import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { DestinationsGallery } from "./DestinationsGallery";

const LARGURA_CARD = 400;
const PASSO = LARGURA_CARD + 20; // + GAP
const SET = 4200; // largura de um conjunto de 10 cards

/**
 * happy-dom não faz layout, então card e trilha medem zero e o carrossel
 * desistiria do passo. O stub entrega as medidas que o navegador daria.
 */
function medirTrilha(container: HTMLElement) {
  const trilho = container.querySelector<HTMLElement>("[role='group']");
  if (!trilho) throw new Error("trilha não encontrada");
  for (const card of container.querySelectorAll<HTMLElement>("[data-card]")) {
    card.getBoundingClientRect = () => ({ width: LARGURA_CARD }) as DOMRect;
  }
  Object.defineProperty(trilho, "scrollWidth", { value: SET * 2, configurable: true });
  return trilho;
}

describe("DestinationsGallery — contrato do carrossel de destinos", () => {
  /**
   * O rótulo ficava atrás de `group-hover`, então no celular ele nunca existia.
   * A asserção olha a classe porque `opacity-0` deixa o nó no documento: um
   * `toBeVisible` passaria mesmo com o texto invisível na tela.
   */
  it("a contagem de estacionamentos aparece sem depender de hover", () => {
    renderWithProviders(<DestinationsGallery />);
    const rotulos = screen.getAllByText(/\d+ estacionamentos?$/);
    expect(rotulos.length).toBeGreaterThan(0);
    for (const rotulo of rotulos) {
      expect(rotulo.className).not.toMatch(/opacity-0|group-hover:/);
    }
  });

  it("nenhum card deforma no hover", () => {
    const { container } = renderWithProviders(<DestinationsGallery />);
    const cards = container.querySelectorAll("[data-card] a");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.className).not.toMatch(/hover:scale-y/);
    }
  });

  /** Altura desigual era o layout desalinhado antigo, trocado por card único. */
  it("todos os cards têm a mesma altura", () => {
    const { container } = renderWithProviders(<DestinationsGallery />);
    const cards = container.querySelectorAll<HTMLElement>("[data-card] a");
    const alturas = new Set([...cards].map((c) => c.style.height));
    expect(alturas.size).toBe(1);
  });

  /** O passo do avanço automático é medido a partir deste marcador. */
  it("cada item da trilha carrega o marcador que o passo mede", () => {
    const { container } = renderWithProviders(<DestinationsGallery />);
    const trilha = container.querySelector("[role='group'] > div");
    expect(trilha).not.toBeNull();
    expect(trilha?.children.length).toBe(container.querySelectorAll("[data-card]").length);
  });
});

describe("DestinationsGallery — avanço automático", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * O que o marquee não fazia: parar num card inteiro. O passo tem que fechar
   * exatamente em card + gap, senão a imagem para cortada na borda.
   */
  it("anda um card inteiro por vez e para alinhado", () => {
    vi.useFakeTimers();
    const { container } = renderWithProviders(<DestinationsGallery />);
    const trilho = medirTrilha(container);

    expect(trilho.scrollLeft).toBe(0);

    // Intervalo até o passo disparar, mais a duração do passo.
    vi.advanceTimersByTime(4000 + 600 + 50);
    expect(trilho.scrollLeft).toBe(PASSO);

    vi.advanceTimersByTime(4000 + 600 + 50);
    expect(trilho.scrollLeft).toBe(PASSO * 2);
  });

  /** No meio do passo o card está andando, não teleportado. */
  it("o passo é animado, não um salto", () => {
    vi.useFakeTimers();
    const { container } = renderWithProviders(<DestinationsGallery />);
    const trilho = medirTrilha(container);

    vi.advanceTimersByTime(4000 + 300);
    expect(trilho.scrollLeft).toBeGreaterThan(0);
    expect(trilho.scrollLeft).toBeLessThan(PASSO);
  });

  /**
   * A trilha traz o conjunto duas vezes. Ao cruzar a emenda, a posição volta um
   * conjunto inteiro, o que deixa a tela idêntica e esconde a repetição.
   */
  it("ao cruzar o fim do conjunto, a posição volta sem saltar a tela", () => {
    vi.useFakeTimers();
    const { container } = renderWithProviders(<DestinationsGallery />);
    const trilho = medirTrilha(container);
    trilho.scrollLeft = SET - 200;

    vi.advanceTimersByTime(4000 + 600 + 50);
    expect(trilho.scrollLeft).toBe(SET - 200 + PASSO - SET);
  });

  /** Quem pediu menos movimento fica só com o arrasto. */
  it("não anda sozinho com prefers-reduced-motion", () => {
    vi.useFakeTimers();
    const matchMediaOriginal = window.matchMedia;
    window.matchMedia = ((consulta: string) =>
      ({
        matches: consulta.includes("prefers-reduced-motion"),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    try {
      const { container } = renderWithProviders(<DestinationsGallery />);
      const trilho = medirTrilha(container);
      vi.advanceTimersByTime(4000 * 3);
      expect(trilho.scrollLeft).toBe(0);
    } finally {
      window.matchMedia = matchMediaOriginal;
    }
  });
});
