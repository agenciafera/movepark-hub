import { describe, expect, it } from "vitest";
import {
  aeroportoEmProsa,
  introDaPergunta,
  keywordDoTitulo,
  shortSemCodigo,
  tituloDaPergunta,
} from "./faqPagina.logic";
import { TITLE_MAX } from "@/lib/seo";

const GRU = {
  name: "Aeroporto Internacional de São Paulo/Guarulhos",
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

  // Regressão de 06/10/2026: a rodoviária saía como "Aeroporto de Tietê".
  it("destino que não é aeroporto sai com o próprio nome", () => {
    expect(
      aeroportoEmProsa({ name: "Terminal Rodoviário Tietê", short_name: "Tietê" } as typeof SDU),
    ).toBe("Terminal Rodoviário Tietê");
    expect(
      aeroportoEmProsa({ name: "Centro de São Paulo", short_name: "Centro SP" } as typeof SDU),
    ).toBe("Centro de São Paulo");
  });
});

describe("introDaPergunta", () => {
  it("o primeiro parágrafo carrega a palavra-chave e o código do aeroporto", () => {
    const intro = introDaPergunta(GRU, "precos");
    expect(intro).toContain("estacionamento no Aeroporto de Guarulhos (GRU)");
    expect(intro).toContain("preços e o passo a passo estão logo abaixo");
  });

  /** Sem parceiro precificado não existe seção de preços: a intro não promete uma. */
  it("pergunta de preço sem preço do motor promete o comparativo, não preços", () => {
    const intro = introDaPergunta(SDU, "comparativo");
    expect(intro).toContain("estacionamento no Aeroporto Santos Dumont (SDU)");
    expect(intro).toContain("o comparativo da região está logo abaixo");
    expect(intro).not.toContain("preços e o passo a passo");
  });

  /** Fora da página de preço, a intro promete os detalhes do tema da pergunta. */
  it("pergunta que não é de preço promete os detalhes", () => {
    const intro = introDaPergunta(GRU, "detalhes");
    expect(intro).toContain("os detalhes estão logo abaixo");
    expect(intro).not.toContain("preços e o passo a passo");
  });

  it("global fala de estacionamento de aeroporto", () => {
    expect(introDaPergunta(null, "detalhes")).toContain("estacionamento de aeroporto");
  });
});

describe("tituloDaPergunta", () => {
  // Os casos são os grupos repetidos da auditoria de 26/10/2026 (Conteúdo 65): a mesma
  // pergunta em até 22 aeroportos saía com o mesmo title.
  const keyword = (curto: string) => `Estacionamento Aeroporto ${curto}`;
  const gru = { aeroporto: "Guarulhos", code: "GRU" };
  const jpa = { aeroporto: "João Pessoa", code: "JPA" };

  it("pergunta longa sem aeroporto não perde o aeroporto no title", () => {
    const pergunta = "E se meu voo atrasar ou eu voltar antes do previsto?";
    const a = tituloDaPergunta(pergunta, keyword("Guarulhos"), gru);
    const b = tituloDaPergunta(pergunta, keyword("João Pessoa"), jpa);
    expect(a).not.toBe(b);
    expect(a).toContain("GRU");
    expect(b).toContain("JPA");
    for (const t of [a, b]) expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it("pergunta que cita o aeroporto e estoura o teto continua distinta depois do corte", () => {
    const vcp = tituloDaPergunta(
      "Qual o estacionamento mais barato perto do Aeroporto de Viracopos?",
      keyword("Viracopos"),
      { aeroporto: "Viracopos", code: "VCP" },
    );
    const cgh = tituloDaPergunta(
      "Qual o estacionamento mais barato perto do Aeroporto de Congonhas?",
      keyword("Congonhas"),
      { aeroporto: "Congonhas", code: "CGH" },
    );
    expect(vcp).not.toBe(cgh);
    expect(vcp.endsWith("(VCP)")).toBe(true);
    expect(vcp.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it("pergunta que cita o aeroporto e cabe sai sozinha, sem repetir o nome", () => {
    expect(
      tituloDaPergunta("Tem estacionamento coberto em Guarulhos?", keyword("Guarulhos"), gru),
    ).toBe("Tem estacionamento coberto em Guarulhos? | Movepark");
  });

  it("pergunta curta de destino mantém a palavra-chave e a marca", () => {
    expect(tituloDaPergunta("Tem traslado?", keyword("Guarulhos"), gru)).toBe(
      "Tem traslado? · Estacionamento Aeroporto Guarulhos | Movepark",
    );
  });

  it("acento não engana a checagem de que a pergunta cita o aeroporto", () => {
    expect(
      tituloDaPergunta("Onde estacionar em Joao Pessoa?", keyword("João Pessoa"), jpa),
    ).not.toContain("(JPA)");
  });

  it("FAQ global segue a regra antiga: pergunta inteira e o sufixo é o que sai", () => {
    expect(
      tituloDaPergunta("Posso cancelar minha reserva?", "Estacionamento de Aeroporto", null),
    ).toBe("Posso cancelar minha reserva? · Estacionamento de Aeroporto");
    expect(tituloDaPergunta("Tem Pix?", "Estacionamento de Aeroporto", null)).toBe(
      "Tem Pix? · Estacionamento de Aeroporto | Movepark",
    );
  });
});
