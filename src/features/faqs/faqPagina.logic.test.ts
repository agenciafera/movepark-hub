import { describe, expect, it } from "vitest";
import {
  aeroportoEmProsa,
  introDaPergunta,
  keywordDoTitulo,
  shortSemCodigo,
} from "./faqPagina.logic";

const GRU = {
  name: "Aeroporto Internacional de São Paulo–Guarulhos",
  short_name: "Guarulhos (GRU)",
  slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
  code: "GRU",
};
const SDU = {
  name: "Aeroporto Santos Dumont",
  short_name: "Santos Dumont (SDU)",
  slug: "aeroporto-santos-dumont",
  code: "SDU",
};
const TIETE = {
  name: "Terminal Rodoviário Tietê",
  short_name: "Tietê",
  slug: "terminal-rodoviario-tiete",
  code: "tiete",
};

describe("shortSemCodigo", () => {
  it("tira o código IATA do nome curto", () => {
    expect(shortSemCodigo("Guarulhos (GRU)", GRU.name)).toBe("Guarulhos");
    expect(shortSemCodigo("Tietê", TIETE.name)).toBe("Tietê");
    expect(shortSemCodigo(null, "Aeroporto de Congonhas")).toBe("Aeroporto de Congonhas");
  });
});

describe("keywordDoTitulo", () => {
  it("monta a palavra-chave como a busca digita", () => {
    expect(keywordDoTitulo(GRU)).toBe("Estacionamento Aeroporto Guarulhos");
    expect(keywordDoTitulo(SDU)).toBe("Estacionamento Aeroporto Santos Dumont");
  });

  it("destino que não é aeroporto fica sem a palavra Aeroporto", () => {
    expect(keywordDoTitulo(TIETE)).toBe("Estacionamento Tietê");
  });

  it("pergunta global usa a forma genérica", () => {
    expect(keywordDoTitulo(null)).toBe("Estacionamento de Aeroporto");
    expect(keywordDoTitulo(undefined)).toBe("Estacionamento de Aeroporto");
  });
});

describe("aeroportoEmProsa", () => {
  it("usa o nome oficial quando é curto", () => {
    expect(aeroportoEmProsa(SDU)).toBe("Aeroporto Santos Dumont");
  });

  it("cai na forma corrente quando o oficial é longo", () => {
    expect(aeroportoEmProsa(GRU)).toBe("Aeroporto de Guarulhos");
  });
});

describe("introDaPergunta", () => {
  it("o primeiro parágrafo carrega a palavra-chave e o código do aeroporto", () => {
    const intro = introDaPergunta(GRU);
    expect(intro).toContain("estacionamento no Aeroporto de Guarulhos (GRU)");
  });

  it("global fala de estacionamento de aeroporto", () => {
    expect(introDaPergunta(null)).toContain("estacionamento de aeroporto");
  });
});
