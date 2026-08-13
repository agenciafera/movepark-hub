import { describe, expect, it } from "vitest";
import { proximaPosicao } from "./carousel.logic";

const SET = 4200;

describe("proximaPosicao", () => {
  it("avança somando o passo enquanto está dentro do primeiro conjunto", () => {
    expect(proximaPosicao(100, 76, SET)).toBe(176);
  });

  /**
   * A trilha tem o mesmo conjunto duas vezes: descontar a largura de um conjunto
   * deixa a tela idêntica, e o loop não tem emenda. Voltar ao zero denunciaria a
   * repetição com um salto.
   */
  it("ao cruzar o fim do conjunto, desconta a largura em vez de voltar ao zero", () => {
    expect(proximaPosicao(SET - 10, 40, SET)).toBe(30);
  });

  it("cruzar exatamente no limite já dá a volta", () => {
    expect(proximaPosicao(SET - 40, 40, SET)).toBe(0);
  });

  /** Quem arrasta para o outro lado chega antes do início. */
  it("passo negativo antes do início volta para o fim do conjunto", () => {
    expect(proximaPosicao(10, -40, SET)).toBe(SET - 30);
  });

  /** Antes da medida do layout a largura é 0, e dividir o loop por ela travaria. */
  it("sem largura medida, a posição não muda", () => {
    expect(proximaPosicao(120, 76, 0)).toBe(120);
  });
});
