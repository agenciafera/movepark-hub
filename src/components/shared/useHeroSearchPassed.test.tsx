import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { HERO_SEARCH_ATTR, useHeroSearchPassed } from "./useHeroSearchPassed";

type Callback = (
  entries: { isIntersecting: boolean; boundingClientRect: { top: number } }[],
) => void;

let disparar: Callback | null = null;
const desconectar = vi.fn();

/** Observer de mentira: guarda o callback para o teste empurrar a posição. */
class FakeObserver {
  constructor(cb: Callback) {
    disparar = cb;
  }
  observe() {}
  disconnect() {
    desconectar();
  }
}

describe("useHeroSearchPassed", () => {
  beforeEach(() => {
    disparar = null;
    desconectar.mockClear();
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const alvo = document.createElement("div");
    alvo.setAttribute("data-hero", "search");
    document.body.appendChild(alvo);
  });

  afterEach(() => {
    document.querySelector(HERO_SEARCH_ATTR)?.remove();
    vi.unstubAllGlobals();
  });

  it("começa desligado: no topo da home a barra do hero está na tela", () => {
    const { result } = renderHook(() => useHeroSearchPassed(true));
    expect(result.current).toBe(false);
  });

  it("liga quando a barra do hero sai por cima", () => {
    const { result } = renderHook(() => useHeroSearchPassed(true));
    act(() => disparar!([{ isIntersecting: false, boundingClientRect: { top: -300 } }]));
    expect(result.current).toBe(true);
  });

  /**
   * Sem o teste de posição, um hero fora da tela por qualquer motivo (ainda
   * abaixo da dobra, por exemplo) já ligaria a busca do header.
   */
  it("fora da tela por baixo não conta como passou", () => {
    const { result } = renderHook(() => useHeroSearchPassed(true));
    act(() => disparar!([{ isIntersecting: false, boundingClientRect: { top: 900 } }]));
    expect(result.current).toBe(false);
  });

  it("desligado, nem observa: fora da home o header já mostra a busca sempre", () => {
    const { result } = renderHook(() => useHeroSearchPassed(false));
    expect(result.current).toBe(false);
    expect(disparar).toBeNull();
  });

  it("desmontar solta o observer", () => {
    const { unmount } = renderHook(() => useHeroSearchPassed(true));
    unmount();
    expect(desconectar).toHaveBeenCalled();
  });
});
