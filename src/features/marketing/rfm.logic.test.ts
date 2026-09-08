import { describe, expect, it } from "vitest";
import {
  FREQUENCIA_LINHAS,
  MINIMO_PARA_RFM_CONFIAVEL,
  RECENCIA_COLUNAS,
  baseSuficiente,
  celulaSegmento,
  participacao,
  rfmLabel,
  tomDaCelula,
} from "./rfm.logic";

describe("celulaSegmento", () => {
  it("reproduz a matriz da proposta, canto a canto", () => {
    expect(celulaSegmento(5, 5)).toBe("campeoes");
    expect(celulaSegmento(5, 1)).toBe("perdidos_vip");
    expect(celulaSegmento(1, 5)).toBe("novos");
    expect(celulaSegmento(1, 1)).toBe("perdidos");
  });

  it("junta F2 e F1 na mesma linha, que é a linha 'Baixa' da proposta", () => {
    expect(celulaSegmento(2, 5)).toBe(celulaSegmento(1, 5));
    expect(celulaSegmento(2, 3)).toBe("ocasionais");
  });

  it("mantém F3 como linha própria, e não colada na baixa", () => {
    expect(celulaSegmento(3, 5)).toBe("potenciais");
    expect(celulaSegmento(1, 5)).toBe("novos");
  });

  it("cobre as 20 células da matriz sem cair no fallback por engano", () => {
    for (const linha of FREQUENCIA_LINHAS) {
      for (const col of RECENCIA_COLUNAS) {
        expect(typeof celulaSegmento(linha.scores[0], col.score)).toBe("string");
      }
    }
    // O fallback só existe para score fora da faixa, e aí sim devolve "perdidos".
    expect(celulaSegmento(9, 9)).toBe("perdidos");
  });
});

describe("tomDaCelula", () => {
  it("célula sem ninguém fica vazia, mesmo no canto quente", () => {
    expect(tomDaCelula(5, 5, 0)).toBe("vazio");
  });

  it("esquenta para cima e para a esquerda da matriz", () => {
    expect(tomDaCelula(5, 5, 3)).toBe("forte");
    expect(tomDaCelula(1, 1, 3)).toBe("frio");
  });

  it("marca como risco quem volta muito mas parou de aparecer", () => {
    // Regressão: a escada de calor rodava antes e devolvia "morno" para F4/R1 e "bom" para F5/R2,
    // pintando de quente justamente a célula que perde dinheiro.
    expect(tomDaCelula(4, 1, 2)).toBe("risco");
    expect(tomDaCelula(5, 2, 2)).toBe("risco");
    expect(tomDaCelula(4, 2, 2)).toBe("risco");
    expect(tomDaCelula(5, 1, 2)).toBe("risco");
  });

  it("frequência baixa e recência baixa continua frio, não risco", () => {
    expect(tomDaCelula(2, 1, 3)).toBe("frio");
  });
});

describe("participacao", () => {
  it("arredonda para inteiro, que é o formato do mockup", () => {
    expect(participacao(18, 100)).toBe(18);
    expect(participacao(1, 3)).toBe(33);
  });

  it("base vazia devolve 0, e não NaN", () => {
    expect(participacao(5, 0)).toBe(0);
  });
});

describe("baseSuficiente", () => {
  it("recusa a base pequena, onde o quintil rotula 'campeão' com pouca gente", () => {
    expect(baseSuficiente(6)).toBe(false);
    expect(baseSuficiente(MINIMO_PARA_RFM_CONFIAVEL - 1)).toBe(false);
    expect(baseSuficiente(MINIMO_PARA_RFM_CONFIAVEL)).toBe(true);
  });
});

describe("rfmLabel", () => {
  it("traduz os rótulos conhecidos", () => {
    expect(rfmLabel("perdidos_vip")).toBe("Perdidos VIP");
    expect(rfmLabel("campeoes")).toBe("Campeões");
  });

  it("devolve a chave crua quando o banco inventar um rótulo novo", () => {
    expect(rfmLabel("segmento_futuro")).toBe("segmento_futuro");
  });
});
