import { describe, expect, it } from "vitest";

// Import atravessando a fronteira para `scripts/` de propósito: a lógica é do coletor de
// baseline e roda no `node`, mas sem teste a classificação que decide em qual cluster cada
// consulta soma ficaria sem cobertura, e é ela que a comparação de 90 dias vai usar.
// A declaração de tipo mora em `scripts/gsc-baseline.logic.d.mts`.
// Ver docs/specs/baseline-search-console.md.
import {
  aeroportoDaConsulta,
  aeroportoDaUrl,
  classificarConsultas,
  clustersDaConsulta,
  janelaDe16Meses,
  normalizar,
  numero,
  paraCsv,
  posicaoPonderada,
  recorteDeClusters,
} from "../../scripts/gsc-baseline.logic.mjs";

function linha(consulta: string, clicks = 1, impressions = 10, position = 5) {
  return { keys: [consulta], clicks, impressions, ctr: clicks / impressions, position };
}

describe("normalizar", () => {
  it("tira acento e caixa para a consulta cair no mesmo balde", () => {
    expect(normalizar("PREÇO da Diária")).toBe("preco da diaria");
  });
});

describe("aeroportoDaConsulta", () => {
  it("reconhece os quatro aeroportos da onda 1 por nome e por código", () => {
    expect(aeroportoDaConsulta("estacionamento guarulhos")).toBe("GRU");
    expect(aeroportoDaConsulta("estacionamento aeroporto vcp")).toBe("VCP");
    expect(aeroportoDaConsulta("estacionamento confins")).toBe("CNF");
    expect(aeroportoDaConsulta("estacionamento afonso pena")).toBe("CWB");
  });

  it("não casa o código dentro de outra palavra", () => {
    // "gru" dentro de "grupo" foi o motivo de a comparação exigir fronteira de palavra.
    expect(aeroportoDaConsulta("grupo de estacionamento")).toBeNull();
  });

  it("devolve null para consulta sem aeroporto da onda 1", () => {
    expect(aeroportoDaConsulta("estacionamento aeroporto de salvador")).toBeNull();
  });
});

describe("aeroportoDaUrl", () => {
  it("casa pelo slug do destino", () => {
    expect(aeroportoDaUrl("https://movepark.co/destinos/aeroporto-de-viracopos")).toBe("VCP");
  });

  it("casa o post do acervo, cujo slug herdado do WordPress não segue o slug do destino", () => {
    expect(aeroportoDaUrl("https://movepark.co/blog/5-vantagens-de-estacionar-no-aeroporto-de-curitiba/")).toBe(
      "CWB",
    );
  });

  it("devolve null para página sem aeroporto", () => {
    expect(aeroportoDaUrl("https://movepark.co/como-funciona")).toBeNull();
  });
});

describe("clustersDaConsulta", () => {
  it("classifica cada cluster de cabeça", () => {
    expect(clustersDaConsulta("preço estacionamento gru").principal).toBe("preco");
    expect(clustersDaConsulta("estacionamento perto do aeroporto").principal).toBe("proximidade");
    expect(clustersDaConsulta("estacionamento barato gru").principal).toBe("barato");
  });

  it("soma a consulta ambígua em um cluster só, mas guarda os dois", () => {
    const resultado = clustersDaConsulta("preço do estacionamento mais barato em gru");
    expect(resultado.principal).toBe("barato");
    expect(resultado.todos).toEqual(["barato", "preco"]);
  });

  it("devolve null quando a consulta não é de cabeça", () => {
    expect(clustersDaConsulta("como chegar no aeroporto de guarulhos").principal).toBeNull();
  });
});

describe("janelaDe16Meses", () => {
  it("abre exatamente 16 meses e desconta o atraso de coleta do fim", () => {
    expect(janelaDe16Meses(new Date("2026-08-26T00:00:00Z"))).toEqual({
      inicio: "2025-04-24",
      fim: "2026-08-23",
    });
  });
});

describe("posicaoPonderada", () => {
  it("pondera por impressão, não por linha", () => {
    // Média simples daria 5,5. O termo de 1000 impressões é que manda.
    expect(
      posicaoPonderada([
        { impressions: 1000, position: 10 },
        { impressions: 1, position: 1 },
      ]),
    ).toBeCloseTo(9.991, 3);
  });

  it("devolve null sem impressão, porque posição zero viraria primeiro lugar", () => {
    expect(posicaoPonderada([{ impressions: 0, position: 0 }])).toBeNull();
  });
});

describe("recorteDeClusters", () => {
  const recorte = recorteDeClusters([
    linha("estacionamento barato guarulhos", 5, 100, 8),
    linha("preço estacionamento gru", 2, 50, 12),
    linha("estacionamento perto do aeroporto de confins", 1, 20, 3),
    linha("como chegar em viracopos", 9, 900, 1),
    linha("estacionamento aeroporto de salvador barato", 9, 900, 1),
  ]);

  it("devolve as 12 células, inclusive as vazias", () => {
    expect(recorte).toHaveLength(12);
    const vazia = recorte.find((c) => c.aeroporto === "CWB" && c.cluster === "preco");
    expect(vazia).toMatchObject({ consultas: 0, cliques: 0, impressoes: 0, posicao: null });
  });

  it("soma cliques e impressões na célula certa", () => {
    expect(recorte.find((c) => c.aeroporto === "GRU" && c.cluster === "barato")).toMatchObject({
      consultas: 1,
      cliques: 5,
      impressoes: 100,
    });
    expect(recorte.find((c) => c.aeroporto === "CNF" && c.cluster === "proximidade")).toMatchObject(
      { consultas: 1, cliques: 1, impressoes: 20 },
    );
  });

  it("ignora consulta fora da onda 1 e consulta que não é de cabeça", () => {
    const total = recorte.reduce((soma, c) => soma + c.consultas, 0);
    expect(total).toBe(3);
  });
});

describe("classificarConsultas", () => {
  it("anota aeroporto e cluster e descarta o resto", () => {
    const classificadas = classificarConsultas([
      linha("diária estacionamento viracopos", 3, 30, 7),
      linha("voo atrasado guarulhos"),
    ]);
    expect(classificadas).toHaveLength(1);
    expect(classificadas[0]).toMatchObject({ aeroporto: "VCP", cluster: "preco", clicks: 3 });
  });
});

describe("paraCsv", () => {
  it("escapa aspas e vírgula, que consulta de busca traz", () => {
    const csv = paraCsv<{ consulta: string }>(
      [{ titulo: "consulta", valor: (l) => l.consulta }],
      [{ consulta: 'estacionamento "barato", gru' }],
    );
    expect(csv).toBe('"consulta"\n"estacionamento ""barato"", gru"\n');
  });
});

describe("numero", () => {
  it("devolve vazio no lugar de null, para o CSV não imprimir a palavra null", () => {
    expect(numero(null)).toBe("");
    expect(numero(3.14159, 2)).toBe("3.14");
  });
});
