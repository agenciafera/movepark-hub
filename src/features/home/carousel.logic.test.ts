import { describe, expect, it } from "vitest";
import { proximaPosicao, suavizar } from "./carousel.logic";

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

describe("suavizar", () => {
  it("começa parado e termina no fim exato do passo", () => {
    expect(suavizar(0)).toBe(0);
    expect(suavizar(1)).toBe(1);
  });

  it("na metade do tempo o card está na metade do caminho", () => {
    expect(suavizar(0.5)).toBeCloseTo(0.5, 10);
  });

  /** Acelerar no início é o que tira a partida seca do passo. */
  it("anda menos que o tempo no primeiro quarto e mais no último", () => {
    expect(suavizar(0.25)).toBeLessThan(0.25);
    expect(suavizar(0.75)).toBeGreaterThan(0.75);
  });

  /**
   * Aba em segundo plano não recebe quadro. Ao voltar, o relógio do passo já
   * estourou o fim, e sem o grampo o card passaria do lugar e voltaria.
   */
  it("grampeia progresso fora de [0, 1]", () => {
    expect(suavizar(4.2)).toBe(1);
    expect(suavizar(-0.3)).toBe(0);
  });
});
