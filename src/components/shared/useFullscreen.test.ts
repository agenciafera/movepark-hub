import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFullscreen } from "./useFullscreen";

function apertaEsc() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
}

describe("useFullscreen", () => {
  it("nasce fechado e alterna", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.fullscreen).toBe(false);

    act(() => result.current.alternar());
    expect(result.current.fullscreen).toBe(true);

    act(() => result.current.alternar());
    expect(result.current.fullscreen).toBe(false);
  });

  it("entrar e sair são idempotentes", () => {
    const { result } = renderHook(() => useFullscreen());
    act(() => result.current.entrar());
    act(() => result.current.entrar());
    expect(result.current.fullscreen).toBe(true);
    act(() => result.current.sair());
    act(() => result.current.sair());
    expect(result.current.fullscreen).toBe(false);
  });

  it("Esc fecha", () => {
    const { result } = renderHook(() => useFullscreen(true));
    expect(result.current.fullscreen).toBe(true);
    apertaEsc();
    expect(result.current.fullscreen).toBe(false);
  });

  it("Esc fora do modo não faz nada, e a tecla errada também não fecha", () => {
    const { result } = renderHook(() => useFullscreen());
    apertaEsc();
    expect(result.current.fullscreen).toBe(false);

    act(() => result.current.entrar());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(result.current.fullscreen).toBe(true);
  });

  it("trava a rolagem do body enquanto está em tela cheia e devolve como estava", () => {
    // Sem a trava, rolar dentro do kanban vaza para a página de baixo quando a lista acaba.
    document.body.style.overflow = "auto";
    const { result } = renderHook(() => useFullscreen());

    act(() => result.current.entrar());
    expect(document.body.style.overflow).toBe("hidden");

    act(() => result.current.sair());
    expect(document.body.style.overflow).toBe("auto");
  });

  it("desmontar em tela cheia devolve a rolagem", () => {
    // Regressão: sair da rota pelo menu com o modo aberto deixaria o site inteiro travado.
    document.body.style.overflow = "";
    const { result, unmount } = renderHook(() => useFullscreen());
    act(() => result.current.entrar());
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("o listener sai junto com o componente", () => {
    const { unmount } = renderHook(() => useFullscreen(true));
    unmount();
    // Não deve estourar nem reagir depois de desmontado.
    expect(() => apertaEsc()).not.toThrow();
  });
});
