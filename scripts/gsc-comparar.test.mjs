import { describe, expect, it } from "vitest";

import {
  caminhoDe,
  comSinal,
  compararClusters,
  concentracao,
  lerCsv,
} from "./gsc-comparar.logic.mjs";

const CSV_CLUSTERS = `"aeroporto","cluster","consultas","cliques","impressoes","posicao_media"
"GRU","preco","154","0","1749","44.06"
"CWB","barato","5","1","71","9.04"
"CNF","proximidade","0","0","0",""`;

describe("lerCsv", () => {
  it("lê o CSV com aspas que o coletor grava", () => {
    const linhas = lerCsv(CSV_CLUSTERS);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ aeroporto: "GRU", cluster: "preco", impressoes: "1749" });
  });

  it("respeita vírgula dentro de campo entre aspas", () => {
    const linhas = lerCsv(`"consulta","impressoes"\n"estacionamento barato, perto","12"`);
    expect(linhas[0].consulta).toBe("estacionamento barato, perto");
    expect(linhas[0].impressoes).toBe("12");
  });
});

describe("compararClusters", () => {
  const antes = lerCsv(CSV_CLUSTERS);
  const depois = lerCsv(`"aeroporto","cluster","consultas","cliques","impressoes","posicao_media"
"GRU","preco","160","1","2119","39.86"
"CWB","barato","6","2","105","11.93"
"CNF","proximidade","24","4","366","12.22"`);
  const linhas = compararClusters(antes, depois);
  const porCelula = (a, c) => linhas.find((l) => l.aeroporto === a && l.cluster === c);

  it("soma o delta de impressão com sinal natural", () => {
    expect(porCelula("GRU", "preco").deltaImpressoes).toBe(370);
  });

  it("trata posição menor como melhora, então o delta é antes menos depois", () => {
    expect(porCelula("GRU", "preco").deltaPosicao).toBeCloseTo(4.2, 1);
    expect(porCelula("CWB", "barato").deltaPosicao).toBeCloseTo(-2.89, 1);
  });

  it("deixa a posição vazia quando a janela não teve impressão, em vez de usar zero", () => {
    const celula = porCelula("CNF", "proximidade");
    expect(celula.posicaoAntes).toBeNull();
    expect(celula.posicaoDepois).toBeCloseTo(12.22, 2);
    expect(celula.deltaPosicao).toBeNull();
  });
});

describe("caminhoDe", () => {
  it("tira host e barra final", () => {
    expect(caminhoDe("https://movepark.co/blog/um-post/")).toBe("/blog/um-post");
  });

  it("devolve o valor cru quando não é URL", () => {
    expect(caminhoDe("/blog/um-post")).toBe("/blog/um-post");
  });
});

describe("concentracao", () => {
  const paginas = lerCsv(`"pagina","aeroporto","cliques","impressoes","ctr","posicao"
"https://movepark.co/blog/dona-de-preco/","GRU","10","500","2.00","12.00"
"https://movepark.co/blog/perdedor-um/","GRU","1","80","1.25","40.00"
"https://movepark.co/estacionamentos/aeroporto-guarulhos","GRU","5","900","0.55","15.00"`);

  it("separa impressão de dona e de slug redirecionado, ignorando o resto do site", () => {
    const c = concentracao(paginas, ["dona-de-preco"], ["perdedor-um"]);
    expect(c.donas).toBe(500);
    expect(c.perdedores).toBe(80);
    expect(c.cliquesDonas).toBe(10);
    expect(c.porPagina).toHaveLength(2);
  });

  it("ordena por impressão, para o relatório mostrar quem ainda pesa", () => {
    const c = concentracao(paginas, ["dona-de-preco"], ["perdedor-um"]);
    expect(c.porPagina[0].caminho).toBe("/blog/dona-de-preco");
    expect(c.porPagina[0].papel).toBe("dona");
  });
});

describe("comSinal", () => {
  it("marca ganho com mais e deixa a perda com o próprio sinal", () => {
    expect(comSinal(370)).toBe("+370");
    expect(comSinal(-247)).toBe("-247");
    expect(comSinal(0)).toBe("0");
  });
});
