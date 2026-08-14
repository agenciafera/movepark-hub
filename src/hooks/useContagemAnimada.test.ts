import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { suavizarContagem, useContagemAnimada, valorNaContagem } from "./useContagemAnimada";

function movimentoReduzido(ligado: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((consulta: string) => ({
      matches: consulta.includes("prefers-reduced-motion") && ligado,
      media: consulta,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("suavizarContagem", () => {
  it("começa em zero e fecha exatamente no fim", () => {
    expect(suavizarContagem(0)).toBe(0);
    expect(suavizarContagem(1)).toBe(1);
  });

  /** Subir rápido e frear longo é o que faz o número assentar em vez de parar seco. */
  it("passa da metade do caminho antes da metade do tempo", () => {
    expect(suavizarContagem(0.5)).toBeGreaterThan(0.5);
  });

  /**
   * Aba em segundo plano não recebe quadro. Ao voltar, o relógio já estourou o
   * fim, e sem o grampo o número passaria do alvo.
   */
  it("grampeia progresso fora de [0, 1]", () => {
    expect(suavizarContagem(3.2)).toBe(1);
    expect(suavizarContagem(-0.4)).toBe(0);
  });
});

describe("valorNaContagem", () => {
  it("entrega números inteiros, porque meio cliente não existe", () => {
    expect(Number.isInteger(valorNaContagem(300_000, 0.37))).toBe(true);
  });

  it("chega ao alvo cravado no fim", () => {
    expect(valorNaContagem(300_000, 1)).toBe(300_000);
  });

  it("nunca passa do alvo", () => {
    for (const p of [0, 0.1, 0.5, 0.9, 1, 1.5]) {
      expect(valorNaContagem(300_000, p)).toBeLessThanOrEqual(300_000);
    }
  });
});

describe("useContagemAnimada", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * O valor inicial é o alvo porque é ele que o SSG grava no HTML: quem chega
   * sem JavaScript vê o número certo, não um zero.
   */
  it("o primeiro valor é o alvo, para o HTML do SSG sair correto", () => {
    movimentoReduzido(true);
    const { result } = renderHook(() => useContagemAnimada(300_000));
    expect(result.current).toBe(300_000);
  });

  it("com movimento reduzido, o número fica parado no alvo", async () => {
    movimentoReduzido(true);
    const { result } = renderHook(() => useContagemAnimada(300_000));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(result.current).toBe(300_000);
  });

  it("conta de zero até o alvo", async () => {
    movimentoReduzido(false);
    const { result } = renderHook(() => useContagemAnimada(300_000, 60));

    // Zera antes da pintura, senão o número final piscaria antes de a contagem começar.
    expect(result.current).toBe(0);

    await waitFor(() => expect(result.current).toBe(300_000), { timeout: 2000 });
  });

  /**
   * Regressão: o alvo chega do servidor depois da primeira renderização. Sem
   * escrever o valor no caminho sem animação, o número ficava preso no padrão
   * para quem pediu menos movimento, e a configuração não surtia efeito.
   */
  it("acompanha o alvo que muda, mesmo sem animação", async () => {
    movimentoReduzido(true);
    const { result, rerender } = renderHook(({ alvo }) => useContagemAnimada(alvo), {
      initialProps: { alvo: 300_000 },
    });
    expect(result.current).toBe(300_000);

    rerender({ alvo: 412_000 });
    await waitFor(() => expect(result.current).toBe(412_000));
  });

  /** Alvo zerado não tem o que contar, e evita dividir a animação por nada. */
  it("alvo zero não dispara contagem", async () => {
    movimentoReduzido(false);
    const { result } = renderHook(() => useContagemAnimada(0));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(result.current).toBe(0);
  });
});
