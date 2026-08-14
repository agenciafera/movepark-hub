import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useHeaderOculto } from "./useHeaderOculto";

/** Rola e deixa o rAF do hook rodar. */
async function rolar(para: number) {
  await act(async () => {
    window.scrollY = para;
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

function largura(px: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: px });
}

describe("useHeaderOculto", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
    largura(390);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("esconde ao descer e devolve ao subir", async () => {
    const { result } = renderHook(() => useHeaderOculto());

    await rolar(600);
    await waitFor(() => expect(result.current).toBe(true));

    await rolar(300);
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("no topo não esconde, mesmo com a rolagem indo para baixo", async () => {
    const { result } = renderHook(() => useHeaderOculto());
    await rolar(40);
    expect(result.current).toBe(false);
  });

  /**
   * Regressão: houve uma versão que desligava o esconder acima de 1128, para
   * proteger as colunas `sticky` que se apoiam no header. Era a proteção errada,
   * porque matava o comportamento em vez de acertar quem depende dele. Hoje quem
   * gruda abaixo do header lê `--topbar-offset` e acompanha.
   */
  it("no desktop esconde igual, e devolve ao subir", async () => {
    largura(1440);
    const { result } = renderHook(() => useHeaderOculto());

    await rolar(600);
    await waitFor(() => expect(result.current).toBe(true));

    await rolar(300);
    await waitFor(() => expect(result.current).toBe(false));
  });

  /**
   * Quem gruda logo abaixo do header lê essa variável. Sem ela, o header some e
   * sobra um vão entre o topo da tela e o elemento preso.
   */
  it("publica o quanto o header ainda ocupa no topo", async () => {
    const leia = () => document.documentElement.style.getPropertyValue("--topbar-offset");

    const { result } = renderHook(() => useHeaderOculto());
    expect(leia()).toBe("80px");

    await rolar(600);
    await waitFor(() => expect(result.current).toBe(true));
    expect(leia()).toBe("0px");
  });

  /**
   * Regressão: o agendamento era uma trava booleana, e bastava um quadro que
   * nunca chegasse (aba em segundo plano) para ela ficar presa em "já agendei".
   * O header parava de responder à rolagem para sempre, sem erro nenhum.
   */
  it("se recupera depois de um quadro que nunca chega", async () => {
    const original = window.requestAnimationFrame;
    // Engole o primeiro agendamento, como faz uma aba oculta.
    vi.spyOn(window, "requestAnimationFrame").mockImplementationOnce(() => 1);

    const { result } = renderHook(() => useHeaderOculto());

    await act(async () => {
      window.scrollY = 500;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toBe(false);

    window.requestAnimationFrame = original;
    await rolar(900);
    await waitFor(() => expect(result.current).toBe(true));
  });
});
