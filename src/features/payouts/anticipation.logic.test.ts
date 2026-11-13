import { describe, expect, it } from "vitest";
import { anticipationGatewaySettings, payerLabel, referenceCostLine, toPayer } from "./anticipation.logic";

describe("antecipação no repasse (E0.3.14)", () => {
  it("custo de referência de um 3x a partir da taxa mensal", () => {
    // 3x: parcelas adiantadas 0, 30 e 60 dias, média de 30 dias = 1 mês de taxa
    expect(referenceCostLine(311)).toBe(
      "Num 3x, receber tudo em 30 dias custa cerca de 3,11% da parte do estacionamento.",
    );
  });

  it("sem taxa cadastrada não promete número", () => {
    expect(referenceCostLine(0)).toBe("Taxa de antecipação não cadastrada em Configurações.");
    expect(referenceCostLine(Number.NaN)).toBe("Taxa de antecipação não cadastrada em Configurações.");
  });

  it("rótulos do pagador", () => {
    expect(payerLabel(null)).toBe("Herda o padrão (Movepark)");
    expect(payerLabel("movepark")).toBe("Movepark");
    expect(payerLabel("partner")).toBe("Estacionamento");
  });

  it("valor do select vira pagador ou null (herdar)", () => {
    expect(toPayer("inherit")).toBeNull();
    expect(toPayer("movepark")).toBe("movepark");
    expect(toPayer("partner")).toBe("partner");
  });

  it("ligar copia a regra do recebedor da Movepark; desligar zera o volume", () => {
    expect(anticipationGatewaySettings(true)).toEqual({
      enabled: true,
      type: "1025",
      volume_percentage: 100,
      delay: 29,
      days: Array.from({ length: 31 }, (_, i) => i + 1),
    });
    expect(anticipationGatewaySettings(false)).toEqual({ enabled: false, type: "full", volume_percentage: 0, delay: null });
  });
});
