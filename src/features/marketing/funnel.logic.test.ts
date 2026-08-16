import { describe, expect, it } from "vitest";
import {
  bandClipPath,
  funnelBands,
  larguraDe,
  LARGURA_MINIMA,
  type FunnelStep,
} from "./funnel.logic";

const degraus: FunnelStep[] = [
  { key: "criadas", label: "Reservas criadas", count: 236 },
  { key: "confirmadas", label: "Pagas", count: 53 },
  { key: "check_in", label: "Check-in feito", count: 31 },
  { key: "concluidas", label: "Estadia concluída", count: 24 },
];

describe("funnelBands", () => {
  it("o topo ocupa a largura inteira", () => {
    const [primeira] = funnelBands(degraus);
    expect(primeira.topPct).toBe(100);
    expect(primeira.conversion).toBe(100);
    expect(primeira.dropped).toBe(0);
  });

  it("a aresta de baixo de uma faixa é a de cima da seguinte", () => {
    // É isso que encaixa os trapézios: sem essa igualdade o desenho fica com degraus soltos.
    const faixas = funnelBands(degraus);
    for (let i = 0; i < faixas.length - 1; i++) {
      expect(faixas[i].bottomPct).toBe(faixas[i + 1].topPct);
    }
  });

  it("a conversão é sobre o degrau anterior, não sobre o topo", () => {
    // 31 de 53 = 58%. Sobre o topo daria 13%, que é um número bonito e inútil.
    const faixas = funnelBands(degraus);
    expect(faixas[1].conversion).toBe(22);
    expect(faixas[2].conversion).toBe(58);
    expect(faixas[3].conversion).toBe(77);
  });

  it("conta quantos ficaram pelo caminho em cada degrau", () => {
    const faixas = funnelBands(degraus);
    expect(faixas[1].dropped).toBe(183);
    expect(faixas[2].dropped).toBe(22);
    expect(faixas[3].dropped).toBe(7);
  });

  it("guarda a fatia do topo, que é outra leitura", () => {
    const faixas = funnelBands(degraus);
    expect(faixas[3].shareOfTop).toBe(10);
  });

  it("a escala de raiz mantém a ordem e um afunilamento visível na cauda", () => {
    // Regressão do primeiro desenho: com escala linear + piso, 53/31/24 saíam todos na largura
    // mínima e as três últimas faixas ficavam do mesmo tamanho. O funil parava de afunilar.
    const faixas = funnelBands(degraus);
    const larguras = faixas.map((f) => f.topPct);
    expect(larguras[0]).toBe(100);
    for (let i = 1; i < larguras.length; i++) {
      expect(larguras[i]).toBeLessThan(larguras[i - 1]);
    }
    expect(new Set(larguras).size).toBe(4);
  });

  it("respeita o piso de largura para o rótulo caber", () => {
    const magro = funnelBands([
      { key: "a", label: "A", count: 1000 },
      { key: "b", label: "B", count: 0 },
    ]);
    // Degrau zerado viraria uma linha; o piso segura, e o número escrito conta a verdade.
    expect(magro[1].topPct).toBe(LARGURA_MINIMA);
    expect(magro[1].count).toBe(0);
    expect(magro[1].conversion).toBe(0);
  });

  it("larguraDe é a raiz da fatia, não a fatia", () => {
    // 1/4 do topo vira metade da largura, que é o ponto da escala de área.
    expect(larguraDe(25, 100)).toBe(50);
    expect(larguraDe(100, 100)).toBe(100);
  });

  it("o último trapézio afunila num bico", () => {
    const faixas = funnelBands(degraus);
    const ultima = faixas[faixas.length - 1];
    expect(ultima.bottomPct).toBeLessThan(ultima.topPct);
    expect(ultima.bottomPct).toBeGreaterThan(0);
  });

  it("sem ninguém no topo não há funil", () => {
    // Quatro faixas de largura mínima sugeririam movimento que não houve.
    expect(funnelBands([{ key: "a", label: "A", count: 0 }])).toEqual([]);
    expect(funnelBands([])).toEqual([]);
  });

  it("degrau que cresce não estoura os 100%", () => {
    // Não deveria acontecer num funil, mas dado torto não pode quebrar o desenho.
    const torto = funnelBands([
      { key: "a", label: "A", count: 10 },
      { key: "b", label: "B", count: 40 },
    ]);
    expect(torto[1].topPct).toBe(100);
  });

  it("a cor não passa do último passo da rampa", () => {
    const muitos = funnelBands(
      Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, label: `L${i}`, count: 100 - i })),
    );
    expect(muitos.map((b) => b.tone)).toEqual([0, 1, 2, 3, 3, 3]);
  });
});

describe("bandClipPath", () => {
  it("centra o trapézio", () => {
    // 53 de 236 = 22,5% do topo; na raiz vira 47,4% de largura, logo 50 ± 23,7.
    const [primeira] = funnelBands(degraus);
    expect(bandClipPath(primeira)).toBe("polygon(0% 0%, 100% 0%, 73.7% 100%, 26.3% 100%)");
  });

  it("faixa cheia dos dois lados vira um retângulo", () => {
    const reta = { topPct: 100, bottomPct: 100 } as never;
    expect(bandClipPath(reta)).toBe("polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)");
  });
});
