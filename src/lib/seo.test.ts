import { describe, expect, it } from "vitest";

import {
  destinationHeading,
  destinationListHeading,
  destinationTitle,
  faqHeading,
  listingDescription,
  listingHeading,
  listingTitle,
  locationHeading,
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
  type: "bus_station",
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

  it("traslado e mapa só usam artigo em aeroporto, onde o gênero é sempre o mesmo", () => {
    expect(shuttleHeading(cwb)).toBe("Traslado até o Aeroporto Curitiba");
    expect(locationHeading(cwb)).toBe("Onde fica o Aeroporto Curitiba");
    expect(shuttleHeading(tiete)).toBe("Como funciona o traslado");
    expect(locationHeading(tiete)).toBe("Localização");
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

  // O título antigo era "Vaga Coberta · Aeroporto Afonso Pena | Movepark": sem a marca, que
  // é justamente o maior bloco de demanda (785 cliques em consulta de marca de parceiro).
  it("abre pela marca da unidade", () => {
    expect(listingTitle(abba)).toBe(
      "Abbapark: Estacionamento Aeroporto Curitiba, Vaga Coberta | Movepark",
    );
  });

  it("os três tipos de vaga da mesma unidade deixam de ter H1 idêntico", () => {
    const h1 = ["Vaga Coberta", "Vaga Premium", "Vaga Descoberta"].map((parkingTypeName) =>
      listingHeading({ ...abba, parkingTypeName }),
    );
    expect(new Set(h1).size).toBe(3);
    expect(h1[0]).toBe("Abbapark · Vaga Coberta · Aeroporto Curitiba");
  });

  it("sem destino vinculado, cai para o nome da unidade em vez de quebrar", () => {
    const semDestino = { ...abba, destination: null };
    expect(listingTitle(semDestino)).toBe(
      "Abbapark: Estacionamento Aeroporto Afonso Pena, Vaga Coberta | Movepark",
    );
    expect(listingHeading(semDestino)).toBe("Abbapark · Vaga Coberta · Aeroporto Afonso Pena");
  });

  it("o H1 não usa artigo, porque o gênero muda em destino que não é aeroporto", () => {
    expect(
      listingHeading({
        companyName: "Aerovalet",
        parkingTypeName: "Vaga Coberta",
        destination: tiete,
        locationName: "Terminal Rodoviário Tietê",
      }),
    ).toBe("Aerovalet · Vaga Coberta · Rodoviária Tietê");
  });

  it("a descrição nomeia marca, tipo de vaga e destino dentro do limite de meta", () => {
    const desc = listingDescription({ ...abba, city: "São José dos Pinhais" });
    expect(desc).toBe(
      "Vaga Coberta no Abbapark. Estacionamento Aeroporto Curitiba, São José dos Pinhais. Reserve pela Movepark.",
    );
    expect(desc.length).toBeLessThanOrEqual(160);
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
