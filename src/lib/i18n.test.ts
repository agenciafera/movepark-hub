import { describe, expect, it } from "vitest";

import {
  LOCALES,
  LOCALE_PADRAO,
  caminhoLocalizado,
  clusterHreflang,
  ehLocaleTraduzido,
  localeDoCaminho,
} from "./i18n";

describe("caminhoLocalizado", () => {
  it("o português não ganha prefixo, porque é a fonte", () => {
    expect(
      caminhoLocalizado({ familia: "destino", slug: "aeroporto-guarulhos", locale: "pt-BR" }),
    ).toBe("/estacionamentos/aeroporto-guarulhos");
  });

  it("traduz o SEGMENTO, não só prefixa o idioma", () => {
    // É onde o concorrente deixa valor na mesa: ele publica
    // /en/estacionamento-aeroporto-viracopos, com o caminho em português dentro da
    // versão inglesa.
    expect(caminhoLocalizado({ familia: "destino", slug: "guarulhos-airport", locale: "en" })).toBe(
      "/en/airport-parking/guarulhos-airport",
    );
    expect(
      caminhoLocalizado({ familia: "destino", slug: "aeropuerto-guarulhos", locale: "es" }),
    ).toBe("/es/estacionamiento-aeropuerto/aeropuerto-guarulhos");
  });

  it("carrega o sufixo da subpágina", () => {
    expect(
      caminhoLocalizado({ familia: "destino", slug: "x", locale: "en", sufixo: "/precos" }),
    ).toBe("/en/airport-parking/x/precos");
  });
});

describe("clusterHreflang", () => {
  const pt = { locale: LOCALE_PADRAO, caminho: "https://movepark.co/estacionamentos/gru" };
  const en = { locale: "en" as const, caminho: "https://movepark.co/en/airport-parking/gru" };
  const es = { locale: "es" as const, caminho: "https://movepark.co/es/estacionamiento-aeropuerto/gru" };

  it("inclui a própria página, senão o Google descarta o grupo", () => {
    const c = clusterHreflang([pt, en]);
    expect(c.map((x) => x.hreflang)).toContain("pt-BR");
    expect(c.map((x) => x.hreflang)).toContain("en");
  });

  it("aponta x-default para o português", () => {
    const c = clusterHreflang([pt, en, es]);
    const xd = c.find((x) => x.hreflang === "x-default");
    expect(xd?.href).toBe(pt.caminho);
  });

  it("lista SÓ os idiomas que existem", () => {
    // O portão é o `is_published` da linha de tradução. Entrada para tradução que não
    // existe vira 404, ou pior, português servido como inglês.
    const c = clusterHreflang([pt, en]);
    expect(c.map((x) => x.hreflang)).toEqual(["pt-BR", "en", "x-default"]);
    expect(c.map((x) => x.hreflang)).not.toContain("es");
  });

  it("página sozinha não tem cluster", () => {
    // Um hreflang de um item só é ruído, e alguns validadores tratam como erro.
    expect(clusterHreflang([pt])).toEqual([]);
    expect(clusterHreflang([])).toEqual([]);
  });

  it("é recíproco: a versão inglesa lista as mesmas três entradas", () => {
    const daPt = clusterHreflang([pt, en, es]);
    const daEn = clusterHreflang([pt, en, es]);
    expect(daEn).toEqual(daPt);
  });
});

describe("localeDoCaminho", () => {
  it("lê o prefixo conhecido e devolve o resto", () => {
    expect(localeDoCaminho("/en/airport-parking/gru")).toEqual({
      locale: "en",
      resto: "/airport-parking/gru",
    });
  });

  it("caminho sem prefixo é português", () => {
    expect(localeDoCaminho("/estacionamentos/gru").locale).toBe("pt-BR");
    expect(localeDoCaminho("/").locale).toBe("pt-BR");
  });

  it("não deixa segmento parecido virar idioma", () => {
    // Lista fechada de propósito: /estacionamentos e /es-algo não podem ser lidos
    // como idioma por acaso.
    expect(localeDoCaminho("/es-algo/x").locale).toBe("pt-BR");
    expect(localeDoCaminho("/english/x").locale).toBe("pt-BR");
  });

  it("prefixo sozinho é a home daquele idioma", () => {
    expect(localeDoCaminho("/en")).toEqual({ locale: "en", resto: "/" });
  });
});

describe("invariantes do conjunto", () => {
  it("o padrão está na lista e não é tratado como tradução", () => {
    expect(LOCALES[0]).toBe(LOCALE_PADRAO);
    expect(ehLocaleTraduzido(LOCALE_PADRAO)).toBe(false);
    expect(ehLocaleTraduzido("en")).toBe(true);
  });
});
