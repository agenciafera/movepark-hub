import { describe, expect, it } from "vitest";

/*
 * O guarda de distância vive em `scripts/` porque roda no CI contra o banco, fora do
 * app. Só as funções PURAS são importadas aqui; o `main()` do script está atrás de um
 * `import.meta.url === argv[1]`, então importar não dispara rede.
 */
// @ts-expect-error - script .mjs sem tipos
import { distanciasAfirmadas, divergente, paraMetros } from "../scripts/check-distancias-faq.mjs";

describe("paraMetros", () => {
  it("converte metro e quilômetro, com vírgula decimal", () => {
    expect(paraMetros("979", "m")).toBe(979);
    expect(paraMetros("1,4", "km")).toBe(1400);
    expect(paraMetros("2,6", "km")).toBe(2600);
  });

  it("aguenta separador de milhar", () => {
    expect(paraMetros("1.441", "m")).toBe(1441);
  });
});

describe("distanciasAfirmadas", () => {
  it("pega o número que vem depois do nome", () => {
    const t = "a Aerovalet a 738 m do terminal";
    expect(distanciasAfirmadas(t, "Aerovalet")).toEqual([
      { metros: 738, trecho: "738 m", limite: false },
    ]);
  });

  it("pega o número que vem ANTES do nome", () => {
    // "738 m na Aerovalet e 863 m na Plenty Park": olhar só para a frente atribuiria
    // à Aerovalet a distância da Plenty Park.
    const t = "percurso curto: 738 m na Aerovalet e 863 m na Plenty Park.";
    expect(distanciasAfirmadas(t, "Aerovalet")[0].metros).toBe(738);
    expect(distanciasAfirmadas(t, "Plenty Park")[0].metros).toBe(863);
  });

  it("não rouba a distância da unidade seguinte da lista", () => {
    // Era o falso positivo que derrubava o guarda em toda frase com duas unidades.
    const t = "a Aeropark a 2,7 km e a Aerovalet a 4,5 km, as duas com van.";
    expect(distanciasAfirmadas(t, "Aeropark")[0].metros).toBe(2700);
    expect(distanciasAfirmadas(t, "Aerovalet")[0].metros).toBe(4500);
  });

  it("ignora preço", () => {
    const t = "na Aerovalet R$ 43,90 por dia";
    expect(distanciasAfirmadas(t, "Aerovalet")).toEqual([]);
  });

  it("marca afirmação de teto", () => {
    const t = "R$ 43,90 na Aerovalet, os dois a menos de 900 m do terminal";
    expect(distanciasAfirmadas(t, "Aerovalet")[0]).toMatchObject({ metros: 900, limite: true });
  });

  it("texto sem distância não afirma nada", () => {
    expect(distanciasAfirmadas("A Aerovalet trabalha com vaga coberta.", "Aerovalet")).toEqual([]);
  });
});

describe("divergente", () => {
  it("aceita arredondamento do texto", () => {
    // "1,4 km" para 1.441 m medidos é a forma normal de escrever.
    expect(divergente(1400, 1441)).toBe(false);
    expect(divergente(979, 979)).toBe(false);
  });

  it("reprova erro de ordem de grandeza", () => {
    // O caso real de Guarulhos: a FAQ dizia 480 m e o PostGIS media 4.549 m.
    expect(divergente(480, 4549)).toBe(true);
    // E o de Congonhas: 280 m contra 863 m.
    expect(divergente(280, 863)).toBe(true);
  });

  it("em afirmação de teto, só reprova quem estoura o teto", () => {
    expect(divergente(900, 738, true)).toBe(false);
    expect(divergente(900, 4549, true)).toBe(true);
  });

  it("o piso de 100 m evita ruído em distância curta", () => {
    expect(divergente(300, 380)).toBe(false);
    expect(divergente(300, 500)).toBe(true);
  });
});
