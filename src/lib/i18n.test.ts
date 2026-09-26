import { describe, expect, it } from "vitest";

import {
  LOCALES,
  LOCALE_PADRAO,
  caminhoLocalizado,
  canonicalDoIdioma,
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

describe("contrato de barra final", () => {
  /**
   * O blog herdou do WordPress o endereço COM barra, e o worker preserva essa barra
   * só para `/blog/`. Em idioma traduzido a borda redireciona 307 para a forma sem
   * barra, então a canônica traduzida não pode tê-la: apontaria para uma URL que
   * redireciona. Medido em produção em 25/09/2026.
   */
  it("blog em português mantém a barra; traduzido, não", () => {
    expect(caminhoLocalizado({ familia: "blog", slug: "x", locale: "pt-BR" })).toBe("/blog/x/");
    expect(caminhoLocalizado({ familia: "blog", slug: "x", locale: "en" })).toBe("/en/blog/x");
    expect(caminhoLocalizado({ familia: "blog", slug: "x", locale: "es" })).toBe("/es/blog/x");
  });

  it("as outras famílias não ganham barra em idioma nenhum", () => {
    expect(caminhoLocalizado({ familia: "faq", slug: "x", locale: "pt-BR" })).toBe("/faq/x");
    expect(caminhoLocalizado({ familia: "destino", slug: "x", locale: "pt-BR" })).toBe(
      "/estacionamentos/x",
    );
  });

  it("com sufixo a barra não entra, senão viraria `/precos/`", () => {
    expect(
      caminhoLocalizado({ familia: "blog", slug: "x", locale: "pt-BR", sufixo: "/precos" }),
    ).toBe("/blog/x/precos");
  });
});

describe("canonicalDoIdioma", () => {
  const O = "https://movepark.co";
  const PT = `${O}/estacionamentos/aeroporto-confins`;

  /**
   * O defeito que estava no ar: a página em inglês declarava ser duplicata da portuguesa.
   * Num cluster de hreflang isso apaga a traduzida do índice, porque canônica cruzada diz
   * "não indexe esta, indexe aquela". Autocanonicalização não é preferência, é requisito.
   */
  it("cada idioma aponta para a própria URL, não para a portuguesa", () => {
    expect(
      canonicalDoIdioma({ familia: "destino", locale: "en", canonicalPt: PT, slugTraduzido: "confins-airport", origem: O }),
    ).toBe(`${O}/en/airport-parking/confins-airport`);
    expect(
      canonicalDoIdioma({ familia: "destino", locale: "es", canonicalPt: PT, slugTraduzido: "aeropuerto-confins", origem: O }),
    ).toBe(`${O}/es/estacionamiento-aeropuerto/aeropuerto-confins`);
  });

  it("o português devolve a canônica dele, que pode vir do public_slug", () => {
    // A canônica em pt entra montada porque nasce do `public_slug`, e não do slug interno.
    expect(
      canonicalDoIdioma({ familia: "destino", locale: "pt-BR", canonicalPt: PT, slugTraduzido: "confins-airport", origem: O }),
    ).toBe(PT);
  });

  it("sem slug traduzido cai no português, em vez de montar URL inexistente", () => {
    for (const slug of [null, undefined, ""]) {
      expect(
        canonicalDoIdioma({ familia: "destino", locale: "en", canonicalPt: PT, slugTraduzido: slug, origem: O }),
      ).toBe(PT);
    }
  });

  it("vale para as três famílias, e o blog mantém a barra do português", () => {
    expect(
      canonicalDoIdioma({ familia: "faq", locale: "en", canonicalPt: `${O}/faq/x`, slugTraduzido: "x-en", origem: O }),
    ).toBe(`${O}/en/faq/x-en`);
    expect(
      canonicalDoIdioma({ familia: "blog", locale: "en", canonicalPt: `${O}/blog/x/`, slugTraduzido: "x-en", origem: O }),
    ).toBe(`${O}/en/blog/x-en`);
    expect(
      canonicalDoIdioma({ familia: "blog", locale: "pt-BR", canonicalPt: `${O}/blog/x/`, slugTraduzido: null, origem: O }),
    ).toBe(`${O}/blog/x/`);
  });
});
