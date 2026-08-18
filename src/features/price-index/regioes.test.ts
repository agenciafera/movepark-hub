import { describe, expect, it } from "vitest";
import { agruparPorRegiao, regiaoDaUf } from "./regioes";

describe("regiaoDaUf", () => {
  it("mapeia a UF para a região", () => {
    expect(regiaoDaUf("SP")).toBe("Sudeste");
    expect(regiaoDaUf("pr")).toBe("Sul");
    expect(regiaoDaUf(" BA ")).toBe("Nordeste");
    expect(regiaoDaUf("DF")).toBe("Centro-Oeste");
    expect(regiaoDaUf("AM")).toBe("Norte");
  });

  it("UF ausente ou desconhecida cai em Outros destinos, e não some da lista", () => {
    expect(regiaoDaUf(null)).toBe("Outros destinos");
    expect(regiaoDaUf("")).toBe("Outros destinos");
    expect(regiaoDaUf("XX")).toBe("Outros destinos");
  });
});

describe("agruparPorRegiao", () => {
  const itens = [
    { slug: "gru", state: "SP" },
    { slug: "cwb", state: "PR" },
    { slug: "cnf", state: "MG" },
    { slug: "tiete", state: null },
    { slug: "rec", state: "PE" },
  ];

  it("segue a ordem de REGIOES e omite região sem destino", () => {
    const grupos = agruparPorRegiao(itens);
    expect(grupos.map((g) => g.regiao)).toEqual(["Sudeste", "Sul", "Nordeste", "Outros destinos"]);
    // Norte e Centro-Oeste não têm destino aqui: não viram cabeçalho vazio.
    expect(grupos.some((g) => g.itens.length === 0)).toBe(false);
  });

  it("preserva a ordem de entrada dentro do grupo, que é o sort_order do cadastro", () => {
    const grupos = agruparPorRegiao(itens);
    expect(grupos[0].itens.map((i) => i.slug)).toEqual(["gru", "cnf"]);
    expect(grupos[3].itens.map((i) => i.slug)).toEqual(["tiete"]);
  });

  it("lista vazia não produz grupo", () => {
    expect(agruparPorRegiao([])).toEqual([]);
  });
});
