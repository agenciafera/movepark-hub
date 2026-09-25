import { describe, expect, it } from "vitest";

import { headings } from "./i18nHeadings";
import { destinationListHeading, priceHeading } from "./seo";

const GRU = {
  seo_label: "Aeroporto Guarulhos (GRU)",
  short_name: "Guarulhos",
  name: "Aeroporto Internacional de São Paulo / Guarulhos",
  type: "airport",
};

describe("cabeçalhos por idioma", () => {
  /**
   * Em 24/09/2026 a primeira versão do dicionário achatou uma distinção que o
   * `seo.ts` carrega por medição: a lista de unidades leva o código IATA e os demais
   * H2 não, porque repetir o mesmo bigrama em toda a estrutura é sinal de spam. O
   * teste de contrato pegou o código sumindo do H2 da lista.
   */
  it("o português continua saindo de @/lib/seo, não do dicionário", () => {
    const h = headings("pt-BR", GRU);
    expect(h.lista).toBe(destinationListHeading(GRU));
    expect(h.preco).toBe(priceHeading(GRU));
    // A distinção que se perdeu: a lista leva (GRU), o preço não.
    expect(h.lista).toContain("(GRU)");
    expect(h.preco).not.toContain("(GRU)");
  });

  it("acrescentar idioma não toca no português", () => {
    const antes = headings("pt-BR", GRU);
    headings("en", GRU, "Guarulhos Airport (GRU)");
    expect(headings("pt-BR", GRU)).toEqual(antes);
  });

  it("idioma traduzido usa o rótulo da tradução quando existe", () => {
    const h = headings("en", GRU, "Guarulhos Airport (GRU)");
    expect(h.h1).toBe("Guarulhos Airport (GRU) parking");
    expect(h.preco).toContain("Guarulhos Airport (GRU)");
  });

  it("sem rótulo traduzido, cai no rótulo português em vez de quebrar", () => {
    const h = headings("es", GRU);
    expect(h.h1).toContain("Aeroporto Guarulhos");
    expect(h.ondeFica).toMatch(/^Dónde queda/);
  });
});
