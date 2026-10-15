import { describe, expect, it } from "vitest";
import {
  ancoraParaODestino,
  comecaComEstacionamento,
  nomeDoLoteParaTitulo,
  tituloLoteMapeado,
} from "./loteMapeado.logic";

describe("nomeDoLoteParaTitulo", () => {
  // O caso que foi ao ar: "Estacionamento Estacionamento Bambuzal, em Salvador | Movepark".
  it("não repete a palavra quando o nome já começa com ela", () => {
    expect(nomeDoLoteParaTitulo("Estacionamento Bambuzal")).toBe("Estacionamento Bambuzal");
  });

  it("também pega o nome digitado em minúsculas", () => {
    expect(nomeDoLoteParaTitulo("estacionamento do aeroporto")).toBe("estacionamento do aeroporto");
  });

  it("pega o plural, que duplicaria igual", () => {
    expect(nomeDoLoteParaTitulo("Estacionamentos Reunidos")).toBe("Estacionamentos Reunidos");
  });

  // A palavra no meio não serve: a keyword pesa na primeira palavra do título.
  it("prefixa quando a palavra aparece no meio do nome", () => {
    expect(nomeDoLoteParaTitulo("Park Estacionamento Fácil")).toBe(
      "Estacionamento Park Estacionamento Fácil",
    );
  });

  it("prefixa o nome que não tem a palavra", () => {
    expect(nomeDoLoteParaTitulo("Talentos Park")).toBe("Estacionamento Talentos Park");
  });

  it("não casa palavra que só começa igual", () => {
    expect(comecaComEstacionamento("Estacionamentopolis")).toBe(false);
    expect(nomeDoLoteParaTitulo("Estacionamentopolis")).toBe("Estacionamento Estacionamentopolis");
  });

  it("ignora espaço sobrando nas pontas", () => {
    expect(nomeDoLoteParaTitulo("  Talentos Park  ")).toBe("Estacionamento Talentos Park");
    expect(nomeDoLoteParaTitulo("  Estacionamento Bambuzal ")).toBe("Estacionamento Bambuzal");
  });
});

describe("tituloLoteMapeado", () => {
  it("monta o título inteiro sem duplicar", () => {
    expect(tituloLoteMapeado("Estacionamento Bambuzal", "Salvador")).toBe(
      "Estacionamento Bambuzal, em Salvador | Movepark",
    );
  });

  it("monta o título inteiro com o prefixo quando ele falta", () => {
    expect(tituloLoteMapeado("Talentos Park", "Recife")).toBe(
      "Estacionamento Talentos Park, em Recife | Movepark",
    );
  });
});

describe("ancoraParaODestino (Conteúdo 64)", () => {
  it("dá ao Ponce Park a âncora com o termo de cabeça de Guarulhos", () => {
    expect(ancoraParaODestino("aeroporto-guarulhos", "ponce-park")).toBe(
      "estacionamento no aeroporto de Guarulhos",
    );
  });

  // O mesmo slug em outro destino é outro lote, sem a autoridade da URL antiga.
  it("casa pelo par destino e lote, não só pelo slug do lote", () => {
    expect(ancoraParaODestino("aeroporto-viracopos", "ponce-park")).toBeNull();
  });

  it("deixa de fora os lotes sem link externo, inclusive os de Guarulhos", () => {
    expect(ancoraParaODestino("aeroporto-guarulhos", "bandeira-park")).toBeNull();
    expect(ancoraParaODestino("aeroporto-viracopos", "bandeira-park")).toBeNull();
  });
});
