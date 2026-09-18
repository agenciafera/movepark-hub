import { describe, expect, it } from "vitest";
import {
  ofertaAmountLabel,
  ofertaAudienciaLabel,
  ofertaCapLabel,
  ofertaCondicoes,
  ofertaSelo,
} from "./publicOffers.logic";
import type { OfertaPublica } from "./api";

function oferta(over: Partial<OfertaPublica> = {}): OfertaPublica {
  return {
    code: "BEMVINDO30",
    title: "Primeira reserva",
    terms: null,
    discount_type: "percent",
    // O jsonb devolve numeric como STRING. Se a lógica esquecer o Number(), o cartaz sai "NaN% OFF".
    discount_value: "30.00",
    max_discount_amount: "40.00",
    min_days: null,
    min_amount: null,
    valid_until: null,
    audience: "first_purchase",
    ...over,
  };
}

describe("ofertaAmountLabel", () => {
  it("lê numeric que chegou como string", () => {
    expect(ofertaAmountLabel(oferta())).toBe("30% OFF");
  });

  it("valor fixo sai em reais", () => {
    const l = ofertaAmountLabel(oferta({ discount_type: "fixed", discount_value: "15.00" }));
    expect(l).toContain("15");
    expect(l).toContain("OFF");
  });
});

describe("ofertaCapLabel", () => {
  it("mostra o teto do percentual", () => {
    expect(ofertaCapLabel(oferta())).toContain("40");
  });

  it("valor fixo não repete limite: o próprio valor já é o teto", () => {
    expect(
      ofertaCapLabel(oferta({ discount_type: "fixed", max_discount_amount: "15.00" })),
    ).toBeNull();
  });

  it("percentual sem teto não inventa texto", () => {
    expect(ofertaCapLabel(oferta({ max_discount_amount: null }))).toBeNull();
  });
});

describe("ofertaAudienciaLabel", () => {
  it("descreve o recorte de cada audiência", () => {
    expect(ofertaAudienciaLabel("first_purchase")).toBe("Vale na primeira reserva");
    expect(ofertaAudienciaLabel("second_purchase")).toBe("Vale na segunda reserva");
    expect(ofertaAudienciaLabel("winback")).toMatch(/sem reservar/i);
  });

  it("audiência aberta não vira frase: 'vale para todos' ocupa espaço sem informar", () => {
    expect(ofertaAudienciaLabel("public")).toBeNull();
    expect(ofertaAudienciaLabel("code_only")).toBeNull();
  });
});

describe("ofertaCondicoes", () => {
  it("monta as condições a partir dos CAMPOS, não do texto livre", () => {
    const linhas = ofertaCondicoes(
      oferta({ audience: "public", min_days: 7, min_amount: "100.00", valid_until: "2026-12-31T23:59:59Z" }),
    );
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toBe("A partir de 7 diárias");
    expect(linhas[1]).toContain("100");
    expect(linhas[2]).toContain("Válido até");
  });

  it("singular em uma diária", () => {
    expect(ofertaCondicoes(oferta({ audience: "public", min_days: 1 }))[0]).toBe(
      "A partir de 1 diária",
    );
  });

  it("campanha sem restrição não mostra condição nenhuma", () => {
    expect(ofertaCondicoes(oferta({ audience: "public" }))).toEqual([]);
  });

  it("a audiência entra como primeira condição", () => {
    expect(ofertaCondicoes(oferta())[0]).toBe("Vale na primeira reserva");
  });
});

describe("ofertaSelo", () => {
  it("a aquisição ganha o tom de destaque, que é a que precisa ser vista primeiro", () => {
    expect(ofertaSelo("first_purchase")).toEqual({
      texto: "Para quem nunca reservou",
      tom: "destaque",
    });
  });

  it("retenção usa o tom confirmado, para não competir com a aquisição", () => {
    expect(ofertaSelo("second_purchase")?.tom).toBe("confirmado");
    expect(ofertaSelo("winback")?.tom).toBe("confirmado");
  });

  it("audiência aberta não ganha selo: 'para todos' gastaria a linha mais visível do cartão", () => {
    expect(ofertaSelo("public")).toBeNull();
    expect(ofertaSelo("code_only")).toBeNull();
  });
});
