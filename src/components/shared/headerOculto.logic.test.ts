import { describe, expect, it } from "vitest";
import { ALTURA_DO_HEADER, proximoOculto } from "./headerOculto.logic";

const ALTO = ALTURA_DO_HEADER + 500;

describe("proximoOculto", () => {
  it("descer esconde", () => {
    expect(proximoOculto(ALTO, ALTO + 100, false)).toBe(true);
  });

  it("subir mostra", () => {
    expect(proximoOculto(ALTO + 100, ALTO, true)).toBe(false);
  });

  /** A navegação tem que estar de volta no primeiro gesto para cima. */
  it("basta um gesto curto para cima", () => {
    expect(proximoOculto(ALTO, ALTO - 10, true)).toBe(false);
  });

  it("no topo o header sempre aparece, mesmo descendo", () => {
    expect(proximoOculto(0, ALTURA_DO_HEADER, true)).toBe(false);
    expect(proximoOculto(10, 40, true)).toBe(false);
  });

  /**
   * O repique da rolagem por inércia do celular e o reflow da página alternavam
   * o header a cada quadro, e a barra tremia com o dedo parado.
   */
  it("rolagem mínima não muda nada, para os dois lados", () => {
    expect(proximoOculto(ALTO, ALTO + 3, true)).toBe(true);
    expect(proximoOculto(ALTO, ALTO + 3, false)).toBe(false);
    expect(proximoOculto(ALTO, ALTO - 3, true)).toBe(true);
    expect(proximoOculto(ALTO, ALTO, false)).toBe(false);
  });

  /** O iOS deixa o `scrollY` negativo ao puxar além do topo. */
  it("posição negativa conta como topo", () => {
    expect(proximoOculto(30, -20, true)).toBe(false);
  });
});
