import { describe, expect, it } from "vitest";

import {
  SEGMENTOS_RESERVADOS,
  ancoraVaga,
  caminhoDestino,
  caminhoFicha,
  caminhoFichaComVaga,
  caminhoMaisBarato,
  caminhoPrecos,
} from "./urls";

describe("caminhos do catálogo", () => {
  it("destino e ficha dividem a mesma pasta", () => {
    expect(caminhoDestino("aeroporto-guarulhos")).toBe("/estacionamentos/aeroporto-guarulhos");
    expect(caminhoFicha("aeroporto-guarulhos", "aeropark")).toBe(
      "/estacionamentos/aeroporto-guarulhos/aeropark",
    );
  });

  /** Unidade parceira e lote mapeado montam o mesmo caminho: é o que faz a conversão
   *  manter a URL em vez de redirecionar. */
  it("a ficha não sabe se o lote é parceiro ou mapeado", () => {
    expect(caminhoFicha("aeroporto-recife", "talentos-park")).toBe(
      caminhoFicha("aeroporto-recife", "talentos-park"),
    );
  });

  it("preços e mais barato ficam dentro do destino, e são segmentos reservados", () => {
    expect(caminhoPrecos("aeroporto-viracopos")).toBe(
      "/estacionamentos/aeroporto-viracopos/precos",
    );
    expect(caminhoMaisBarato("aeroporto-viracopos")).toBe(
      "/estacionamentos/aeroporto-viracopos/mais-barato",
    );
    for (const seg of SEGMENTOS_RESERVADOS) {
      expect(caminhoFicha("aeroporto-viracopos", seg)).toBe(
        `/estacionamentos/aeroporto-viracopos/${seg}`,
      );
    }
  });

  /** O tipo de vaga é seleção, não página: vai em query, e o canonical ignora. */
  it("o tipo de vaga entra como query, com o valor escapado", () => {
    expect(caminhoFichaComVaga("aeroporto-curitiba", "abbapark", "covered")).toBe(
      "/estacionamentos/aeroporto-curitiba/abbapark?vaga=covered",
    );
    expect(caminhoFichaComVaga("d", "l", "vaga avulsa")).toContain("?vaga=vaga%20avulsa");
    expect(ancoraVaga("premium")).toBe("#vaga-premium");
  });
});
