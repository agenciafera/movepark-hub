import { describe, expect, it } from "vitest";

import {
  META_CTA,
  META_MAX,
  buildMetaDescription,
  destinationHeading,
  destinationKeyword,
  destinationListHeading,
  destinationTitle,
  faqHeading,
  listingDescription,
  listingHeading,
  listingTitle,
  locationHeading,
  priceHeading,
  priceHook,
  proximityHeading,
  seoLabel,
  seoLabelPrimary,
  seoLabelPrimaryWithCode,
  shuttleHeading,
  topRatedHeading,
} from "@/lib/seo";

const cwb = {
  seo_label: "Aeroporto Curitiba, Afonso Pena (CWB)",
  short_name: "Afonso Pena (CWB)",
  name: "Aeroporto Afonso Pena",
  type: "airport",
};
const cgh = {
  seo_label: "Aeroporto Congonhas (CGH)",
  short_name: "Congonhas (CGH)",
  name: "Aeroporto de Congonhas",
  type: "airport",
};
const tiete = {
  seo_label: "Rodoviária Tietê, São Paulo",
  short_name: "Tietê",
  name: "Terminal Rodoviário Tietê",
  type: "bus_terminal",
};

describe("seoLabel", () => {
  it("usa o rótulo do banco quando existe", () => {
    expect(seoLabel(cwb)).toBe("Aeroporto Curitiba, Afonso Pena (CWB)");
  });

  it("cai para short_name e depois name quando o destino ainda não tem rótulo", () => {
    expect(seoLabel({ seo_label: null, short_name: "Galeão (GIG)", name: "Aeroporto do Galeão" })).toBe(
      "Galeão (GIG)",
    );
    expect(seoLabel({ seo_label: null, short_name: null, name: "Aeroporto do Galeão" })).toBe(
      "Aeroporto do Galeão",
    );
    // Rótulo em branco é o mesmo que não ter: o `||` cobre a string vazia, que o `??` deixaria passar.
    expect(seoLabel({ seo_label: "   ", short_name: "Galeão (GIG)", name: "x" })).toBe("Galeão (GIG)");
  });
});

describe("recortes do rótulo", () => {
  it("primary tira a variante secundária e o código", () => {
    expect(seoLabelPrimary(cwb)).toBe("Aeroporto Curitiba");
    expect(seoLabelPrimary(cgh)).toBe("Aeroporto Congonhas");
    expect(seoLabelPrimary(tiete)).toBe("Rodoviária Tietê");
  });

  it("primaryWithCode devolve o código quando ele existe, e nada quando não existe", () => {
    expect(seoLabelPrimaryWithCode(cwb)).toBe("Aeroporto Curitiba (CWB)");
    expect(seoLabelPrimaryWithCode(cgh)).toBe("Aeroporto Congonhas (CGH)");
    expect(seoLabelPrimaryWithCode(tiete)).toBe("Rodoviária Tietê");
  });
});

describe("título e H1 do destino", () => {
  // O bug medido: o título antigo era "Estacionamento no Aeroporto de Curitiba" (duas
  // preposições no meio do bigrama) e o H1 era "Estacionamento em Afonso Pena", sem a
  // palavra "aeroporto". A consulta que traz mais clique é "estacionamento aeroporto
  // curitiba", com os três tokens colados e nessa ordem.
  it("põe estacionamento e aeroporto colados, sem preposição", () => {
    expect(destinationTitle(cwb)).toBe(
      "Estacionamento Aeroporto Curitiba, Afonso Pena (CWB) | Movepark",
    );
    expect(destinationTitle(cwb)).toContain("Estacionamento Aeroporto Curitiba");
    expect(destinationTitle(cwb)).not.toMatch(/Estacionamento (no|na|do|da|em|de) /);
  });

  it("carrega as duas formas de chamar o aeroporto no mesmo título", () => {
    expect(destinationTitle(cwb)).toContain("Curitiba");
    expect(destinationTitle(cwb)).toContain("Afonso Pena");
  });

  it("H1 repete a forma exata do título e dispensa o código", () => {
    expect(destinationHeading(cwb)).toBe("Estacionamento Aeroporto Curitiba, Afonso Pena");
    expect(destinationHeading(cwb)).not.toContain("(CWB)");
    expect(destinationHeading(cgh)).toBe("Estacionamento Aeroporto Congonhas");
  });

  it("destino que não é aeroporto não ganha a palavra aeroporto", () => {
    expect(destinationTitle(tiete)).toBe("Estacionamento Rodoviária Tietê, São Paulo | Movepark");
    expect(destinationHeading(tiete)).not.toContain("Aeroporto");
  });
});

describe("H2 do destino", () => {
  it("a lista de unidades carrega a palavra-chave", () => {
    expect(destinationListHeading(cwb)).toBe("Estacionamentos Aeroporto Curitiba (CWB)");
  });

  // Antes, destino que não era aeroporto caía num H2 genérico ("Localização", "Como funciona
  // o traslado") só para não errar o gênero, e a página do Tietê perdia a palavra-chave em
  // dois cabeçalhos. O artigo vem do tipo do destino.
  it("todo destino nomeia a palavra-chave no traslado e no mapa, com o artigo certo", () => {
    expect(shuttleHeading(cwb)).toBe("Traslado até o Aeroporto Curitiba");
    expect(locationHeading(cwb)).toBe("Onde fica o Aeroporto Curitiba?");
    expect(shuttleHeading(tiete)).toBe("Traslado até a Rodoviária Tietê");
    expect(locationHeading(tiete)).toBe("Onde fica a Rodoviária Tietê?");
  });

  it("preço, distância e avaliação seguem o mesmo artigo", () => {
    expect(priceHeading(tiete)).toBe("Quanto custa estacionar na Rodoviária Tietê?");
    expect(proximityHeading(tiete)).toBe("Distância até a Rodoviária Tietê");
    expect(topRatedHeading(tiete)).toBe("Mais bem avaliados na Rodoviária Tietê");
  });

  it("FAQ e avaliações também nomeiam o destino", () => {
    expect(faqHeading(cwb)).toBe("Perguntas frequentes: estacionamento Aeroporto Curitiba");
    expect(topRatedHeading(cwb)).toBe("Mais bem avaliados no Aeroporto Curitiba");
  });
});

describe("título e H1 da unidade", () => {
  const abba = {
    companyName: "Abbapark",
    parkingTypeName: "Vaga Coberta",
    destination: cwb,
    locationName: "Aeroporto Afonso Pena",
  };

  // O nome canônico da ficha, o mesmo que o banco guarda em `location.public_name` e que
  // aparece no card, no H1, no <title> e no JSON-LD.
  it("abre pela marca da unidade", () => {
    expect(listingTitle(abba)).toBe("Abbapark - Estacionamento Aeroporto Curitiba | Movepark");
  });

  // O tipo de vaga saiu do título junto com a página por tipo: são três ofertas de UMA
  // ficha, e três títulos diferentes para a mesma página seria o mesmo problema ao contrário.
  it("o tipo de vaga não muda o título nem o H1: a ficha é uma só", () => {
    const h1 = ["Vaga Coberta", "Vaga Premium", "Vaga Descoberta"].map((parkingTypeName) =>
      listingHeading({ ...abba, parkingTypeName }),
    );
    expect(new Set(h1).size).toBe(1);
    expect(h1[0]).toBe("Abbapark - Estacionamento Aeroporto Curitiba");
  });

  // O nome escrito no banco ganha da composição: é ele que passou por revisão editorial
  // (razão social fora, aeroporto sem repetir, "Estacionamento" sem duplicar).
  it("o nome público do banco manda quando existe", () => {
    const comNome = { ...abba, publicName: "Abbapark - Estacionamento Aeroporto Curitiba" };
    expect(listingHeading(comNome)).toBe("Abbapark - Estacionamento Aeroporto Curitiba");
    expect(listingTitle({ ...abba, publicName: "  " })).toBe(
      "Abbapark - Estacionamento Aeroporto Curitiba | Movepark",
    );
  });

  it("sem destino vinculado, cai para o nome da unidade em vez de quebrar", () => {
    const semDestino = { ...abba, destination: null };
    expect(listingTitle(semDestino)).toBe(
      "Abbapark - Estacionamento Aeroporto Afonso Pena | Movepark",
    );
    expect(listingHeading(semDestino)).toBe("Abbapark - Estacionamento Aeroporto Afonso Pena");
  });

  it("destino que não é aeroporto entra pelo rótulo de busca, sem artigo", () => {
    expect(
      listingHeading({
        companyName: "Aerovalet",
        parkingTypeName: "Vaga Coberta",
        destination: tiete,
        locationName: "Terminal Rodoviário Tietê",
      }),
    ).toBe("Aerovalet - Estacionamento Rodoviária Tietê");
  });

  it("a descrição abre pela palavra-chave, leva o menor preço e fecha no CTA", () => {
    const desc = listingDescription({
      ...abba,
      city: "São José dos Pinhais",
      fromPrice: 29.9,
      hubCheckout: true,
    });
    expect(desc).toBe(
      "Estacionamento Aeroporto Curitiba: Vaga Coberta no Abbapark, São José dos Pinhais. " +
        "A partir de R$\u00a029,90 a diária. Reserve online em 2 minutos.",
    );
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  it("sem preço e com reserva fora do Hub, o CTA convida a comparar (ADR-009)", () => {
    const desc = listingDescription({ ...abba, city: "São José dos Pinhais", fromPrice: 0 });
    expect(desc).not.toContain("R$");
    expect(desc).not.toContain("Reserve online em 2 minutos");
    expect(desc.endsWith("Compare e reserve pela Movepark.")).toBe(true);
  });
});

describe("estrutura da meta description", () => {
  it("monta palavra-chave, complemento, preço e CTA nesta ordem", () => {
    expect(
      buildMetaDescription({
        keyword: "Estacionamento Aeroporto Confins",
        extra: "a 8 km do terminal, em Belo Horizonte",
        price: priceHook(45),
        cta: "reservar",
      }),
    ).toBe(
      "Estacionamento Aeroporto Confins, a 8 km do terminal, em Belo Horizonte. " +
        "A partir de R$\u00a045,00 a diária. Reserve online em 2 minutos.",
    );
  });

  it("estourando o limite, descarta o complemento antes do preço", () => {
    const texto = buildMetaDescription({
      keyword: "Estacionamento Aeroporto Internacional de São Paulo, Guarulhos (GRU)",
      extra: "com traslado para os Terminais 1, 2 e 3, a 2,6 km do embarque, em Guarulhos",
      price: priceHook(18.49),
      cta: "comparar",
    });
    expect(texto.length).toBeLessThanOrEqual(META_MAX);
    expect(texto).not.toContain("Terminais");
    expect(texto).toContain("18,49");
    expect(texto.endsWith("Compare e reserve pela Movepark.")).toBe(true);
  });

  it("preço ausente, zero ou inválido não vira frase", () => {
    expect(priceHook(null)).toBeNull();
    expect(priceHook(0)).toBeNull();
    expect(priceHook(Number.NaN)).toBeNull();
    expect(priceHook(93.17, 7)).toBe("A partir de R$\u00a093,17 em 7 diárias.");
  });

  it("o CTA sai do catálogo, e o de checkout no Hub é o único que promete os 2 minutos", () => {
    expect(META_CTA.reservar).toBe("Reserve online em 2 minutos.");
    expect(Object.values(META_CTA).filter((c) => c.includes("2 minutos"))).toHaveLength(1);
    for (const cta of Object.values(META_CTA)) {
      expect(cta).not.toMatch(/[—–]/);
      expect(cta.endsWith(".")).toBe(true);
    }
  });
});

describe("destinationKeyword", () => {
  it("usa o rótulo do banco quando ele já nomeia o aeroporto", () => {
    expect(destinationKeyword(cwb)).toBe("Estacionamento Aeroporto Curitiba (CWB)");
  });

  it("prefixa 'Aeroporto' quando só existe o short_name, que é o caso da matriz de preço", () => {
    expect(
      destinationKeyword({ name: "Aeroporto Internacional de São Paulo/Guarulhos", short_name: "Guarulhos (GRU)", type: "airport" }),
    ).toBe("Estacionamento Aeroporto Guarulhos (GRU)");
  });

  it("não inventa aeroporto em destino que não é aeroporto", () => {
    expect(destinationKeyword(tiete)).toBe("Estacionamento Rodoviária Tietê");
  });
});

describe("regra de marca", () => {
  it("nenhum rótulo gerado usa travessão", () => {
    const todos = [
      destinationTitle(cwb),
      destinationHeading(cwb),
      destinationListHeading(cwb),
      shuttleHeading(cwb),
      locationHeading(cwb),
      faqHeading(cwb),
      topRatedHeading(cwb),
      listingTitle({
        companyName: "Abbapark",
        parkingTypeName: "Vaga Coberta",
        destination: cwb,
        locationName: "Aeroporto Afonso Pena",
      }),
    ];
    for (const t of todos) expect(t).not.toMatch(/[—–]/);
  });
});
