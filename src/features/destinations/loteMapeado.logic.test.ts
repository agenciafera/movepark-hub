import { describe, expect, it } from "vitest";
import {
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
