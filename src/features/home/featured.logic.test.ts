import { describe, expect, it } from "vitest";
import { ordenar, proximaPosicao, rotuloDeDestino, trocarPosicao } from "./featured.logic";

/**
 * A ordem da vitrine é a única coisa desta tela que o usuário percebe errado na hora: um card que
 * sobe dois lugares, ou que não sai do lugar, aparece na home antes de alguém reclamar.
 */

const lista = [
  { id: "a", sort_order: 1 },
  { id: "b", sort_order: 2 },
  { id: "c", sort_order: 3 },
];

describe("trocarPosicao", () => {
  it("troca o sort_order com o vizinho de cima", () => {
    expect(trocarPosicao(lista, "b", "cima")).toEqual([
      { id: "b", sort_order: 1 },
      { id: "a", sort_order: 2 },
    ]);
  });

  it("troca o sort_order com o vizinho de baixo", () => {
    expect(trocarPosicao(lista, "b", "baixo")).toEqual([
      { id: "b", sort_order: 3 },
      { id: "c", sort_order: 2 },
    ]);
  });

  it("mexe só nas duas linhas envolvidas", () => {
    const mexidas = trocarPosicao(lista, "c", "cima").map((r) => r.id);
    expect(mexidas).toEqual(["c", "b"]);
    expect(mexidas).not.toContain("a");
  });

  it("não faz nada no topo nem no fim", () => {
    expect(trocarPosicao(lista, "a", "cima")).toEqual([]);
    expect(trocarPosicao(lista, "c", "baixo")).toEqual([]);
  });

  it("id desconhecido devolve vazio em vez de estourar", () => {
    expect(trocarPosicao(lista, "zzz", "cima")).toEqual([]);
  });

  it("desempata quando as duas linhas têm a mesma posição", () => {
    // Empate acontece: a seed grava sequencial, mas nada impede uma edição no banco. Trocar dois
    // números iguais não moveria nada na tela, e o botão pareceria quebrado.
    const empatada = [
      { id: "a", sort_order: 5 },
      { id: "b", sort_order: 5 },
    ];
    const saida = trocarPosicao(empatada, "b", "cima");
    const ordemFinal = ordenar(
      empatada.map((r) => saida.find((s) => s.id === r.id) ?? r),
    ).map((r) => r.id);
    expect(ordemFinal).toEqual(["b", "a"]);
  });
});

describe("ordenar", () => {
  it("ordena por sort_order", () => {
    const fora = [
      { id: "c", sort_order: 3 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ];
    expect(ordenar(fora).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("no empate usa o id, para a lista não dançar entre renders", () => {
    const empate = [
      { id: "z", sort_order: 1 },
      { id: "a", sort_order: 1 },
    ];
    expect(ordenar(empate).map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("não muda o array de entrada", () => {
    const entrada = [
      { id: "b", sort_order: 2 },
      { id: "a", sort_order: 1 },
    ];
    ordenar(entrada);
    expect(entrada.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("proximaPosicao", () => {
  it("entra depois do maior", () => {
    expect(proximaPosicao(lista)).toBe(4);
  });

  it("lista vazia começa em 1", () => {
    expect(proximaPosicao([])).toBe(1);
  });

  it("ignora buraco na numeração e não repete o maior", () => {
    expect(proximaPosicao([{ sort_order: 1 }, { sort_order: 90 }])).toBe(91);
  });
});

describe("rotuloDeDestino", () => {
  it("usa o short_name como está, sem prefixar o código de novo", () => {
    // Regressão: o card mostrava "(VCP) Viracopos (VCP)" em produção, porque o short_name
    // curado já traz o código e o componente prefixava por cima.
    expect(
      rotuloDeDestino({ code: "VCP", name: "Aeroporto de Viracopos", short_name: "Viracopos (VCP)" }),
    ).toBe("Viracopos (VCP)");
  });

  it("não vaza o code de destino que não é aeroporto", () => {
    // Ali o `code` é slug ("tiete", "centro-sp"), e prefixar dava "(tiete) Tietê".
    expect(
      rotuloDeDestino({ code: "tiete", name: "Terminal Rodoviário Tietê", short_name: "Tietê" }),
    ).toBe("Tietê");
  });

  it("cai no nome completo quando não há short_name", () => {
    expect(rotuloDeDestino({ code: "XYZ", name: "Aeroporto de Teste", short_name: null })).toBe(
      "Aeroporto de Teste",
    );
  });

  it("sem destino devolve null, para o chamador decidir o que mostrar", () => {
    expect(rotuloDeDestino(null)).toBeNull();
  });
});
