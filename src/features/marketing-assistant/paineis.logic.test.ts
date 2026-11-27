import { describe, expect, it } from "vitest";
import { dataCurta, percentual, situacaoDaJanela, variacao } from "./paineis.logic";

describe("paineis.logic", () => {
  it("data curta sem passar pelo fuso", () => {
    expect(dataCurta("2026-12-25")).toBe("25/12");
  });
  it("situação da janela de envio", () => {
    expect(situacaoDaJanela({ abre_em_dias: 21, janela_ate: "2026-12-22" }, "2026-11-27")).toBe("abre em 21 dias");
    expect(situacaoDaJanela({ abre_em_dias: 1, janela_ate: "2026-12-22" }, "2026-12-17")).toBe("abre amanhã");
    expect(situacaoDaJanela({ abre_em_dias: 0, janela_ate: "2026-12-22" }, "2026-12-18")).toBe("abre hoje");
    expect(situacaoDaJanela({ abre_em_dias: -2, janela_ate: "2026-12-22" }, "2026-12-20")).toBe("aberta agora");
    expect(situacaoDaJanela({ abre_em_dias: -5, janela_ate: "2026-12-22" }, "2026-12-23")).toBe("a janela já passou");
  });
  it("variação em percentual, e nada quando não havia base", () => {
    expect(variacao(2, 5)).toBe("+150%");
    expect(variacao(4, 2)).toBe("-50%");
    expect(variacao(0, 3)).toBeNull();
  });
  it("percentual com vírgula", () => {
    expect(percentual(63.4)).toBe("63,4%");
    expect(percentual(null)).toBe("");
  });
});
