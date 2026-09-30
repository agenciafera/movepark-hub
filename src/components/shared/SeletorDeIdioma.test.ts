import { describe, expect, it } from "vitest";

import { alternativasDeIdioma, familiaDoCaminho } from "./SeletorDeIdioma";

describe("familiaDoCaminho", () => {
  it("reconhece a família pelo segmento, em qualquer idioma", () => {
    expect(familiaDoCaminho("/faq/como-cancelar")).toBe("faq");
    expect(familiaDoCaminho("/en/faq/how-to-cancel")).toBe("faq");
    expect(familiaDoCaminho("/es/preguntas-frecuentes/como-cancelar")).toBe("faq");
    expect(familiaDoCaminho("/estacionamentos/aeroporto-guarulhos")).toBe("destino");
    expect(familiaDoCaminho("/en/airport-parking/guarulhos-airport")).toBe("destino");
    expect(familiaDoCaminho("/blog/vaga-em-confins/")).toBe("blog");
  });

  it("devolve null onde não há família, em vez de chutar uma", () => {
    // O seletor some nessas páginas, que é o certo: elas não têm versão traduzida.
    expect(familiaDoCaminho("/")).toBeNull();
    expect(familiaDoCaminho("/sobre")).toBeNull();
    expect(familiaDoCaminho("/precos/aeroporto-guarulhos")).toBeNull();
  });
});

describe("alternativasDeIdioma", () => {
  const FAQ = {
    faq: { slug: "qual-o-mais-barato" },
    idiomas: [
      { locale: "en" as const, slug: "cheapest-parking" },
      { locale: "es" as const, slug: "el-mas-barato" },
    ],
  };

  it("cada idioma recebe o SLUG dele, nunca o português repetido", () => {
    // A regra que nasceu do hreflang que foi a produção apontando para 404.
    expect(alternativasDeIdioma({ pathname: "/en/faq/cheapest-parking", dados: FAQ })).toEqual([
      { locale: "pt-BR", caminho: "/faq/qual-o-mais-barato" },
      { locale: "en", caminho: "/en/faq/cheapest-parking" },
      { locale: "es", caminho: "/es/preguntas-frecuentes/el-mas-barato" },
    ]);
  });

  it("dá a mesma lista vista de qualquer idioma", () => {
    const deEn = alternativasDeIdioma({ pathname: "/en/faq/cheapest-parking", dados: FAQ });
    const dePt = alternativasDeIdioma({ pathname: "/faq/qual-o-mais-barato", dados: FAQ });
    expect(dePt).toEqual(deEn);
  });

  it("página sem tradução não oferece escolha nenhuma", () => {
    // Zero alternativas faz o componente cair no rótulo. Oferecer um botão que leva a
    // 404 seria o defeito do hreflang quebrado, com o leitor clicando por vontade própria.
    expect(
      alternativasDeIdioma({ pathname: "/faq/so-em-portugues", dados: { faq: { slug: "x" }, idiomas: [] } }),
    ).toEqual([]);
    expect(alternativasDeIdioma({ pathname: "/faq/x", dados: null })).toEqual([]);
  });

  it("lista só os idiomas que existem, não os três sempre", () => {
    const soEn = { faq: { slug: "pt" }, idiomas: [{ locale: "en" as const, slug: "en" }] };
    expect(
      alternativasDeIdioma({ pathname: "/faq/pt", dados: soEn }).map((a) => a.locale),
    ).toEqual(["pt-BR", "en"]);
  });

  it("o blog usa o `slug` do post e mantém a barra final do português", () => {
    const post = {
      slug: "vaga-em-confins",
      idiomas: [{ locale: "en" as const, slug: "parking-at-confins" }],
    };
    expect(alternativasDeIdioma({ pathname: "/en/blog/parking-at-confins", dados: post })).toEqual([
      { locale: "pt-BR", caminho: "/blog/vaga-em-confins/" },
      { locale: "en", caminho: "/en/blog/parking-at-confins" },
    ]);
  });

  /**
   * O post do blog também carrega `destination`, e com o slug do aeroporto na frente o
   * "Português" da versão em inglês ia para `/blog/aeroporto-guarulhos/`, que não existe.
   * Foi o link que o `check-internal-links` reprovou no build de 28/09/2026.
   */
  it("o post com aeroporto relacionado usa o slug do post, não o do aeroporto", () => {
    const post = {
      slug: "vagas-cobertas-em-guarulhos",
      destination: { public_slug: "aeroporto-guarulhos", slug: "aeroporto-guarulhos" },
      idiomas: [{ locale: "en" as const, slug: "covered-spots-guarulhos-airport" }],
    };
    expect(
      alternativasDeIdioma({ pathname: "/en/blog/covered-spots-guarulhos-airport", dados: post }),
    ).toEqual([
      { locale: "pt-BR", caminho: "/blog/vagas-cobertas-em-guarulhos/" },
      { locale: "en", caminho: "/en/blog/covered-spots-guarulhos-airport" },
    ]);
  });

  it("sem slug em português não monta nada, em vez de montar `/faq/undefined`", () => {
    expect(
      alternativasDeIdioma({
        pathname: "/en/faq/x",
        dados: { idiomas: [{ locale: "en", slug: "x" }] },
      }),
    ).toEqual([]);
  });
});

describe("alternativasDeIdioma: destino e índice", () => {
  /**
   * O slug em português mora num lugar por superfície. A primeira versão lia só
   * `faq.slug` e `slug`, então nas 44 páginas de destino, que são as que mais recebem
   * gente, o seletor não aparecia: ele caía no rótulo sem oferecer troca.
   */
  it("lê o slug do destino em `destination.public_slug`", () => {
    const dados = {
      destination: { public_slug: "aeroporto-confins", slug: "aeroporto-de-confins" },
      idiomas: [
        { locale: "en" as const, slug: "confins-airport" },
        { locale: "es" as const, slug: "aeropuerto-confins" },
      ],
    };
    expect(
      alternativasDeIdioma({ pathname: "/en/airport-parking/confins-airport", dados }),
    ).toEqual([
      { locale: "pt-BR", caminho: "/estacionamentos/aeroporto-confins" },
      { locale: "en", caminho: "/en/airport-parking/confins-airport" },
      { locale: "es", caminho: "/es/estacionamiento-aeropuerto/aeropuerto-confins" },
    ]);
  });

  it("prefere o `public_slug` ao slug interno, que é o que a URL usa", () => {
    const dados = {
      destination: { public_slug: "aeroporto-confins", slug: "aeroporto-de-confins" },
      idiomas: [{ locale: "en" as const, slug: "confins-airport" }],
    };
    const pt = alternativasDeIdioma({ pathname: "/en/airport-parking/confins-airport", dados })[0];
    expect(pt.caminho).toBe("/estacionamentos/aeroporto-confins");
  });

  it("o índice de FAQ oferece os três idiomas, sem depender de item traduzido", () => {
    // Índice não tem slug: a rota existe em cada idioma porque o build a gera.
    expect(alternativasDeIdioma({ pathname: "/en/faq", dados: null })).toEqual([
      { locale: "pt-BR", caminho: "/faq" },
      { locale: "en", caminho: "/en/faq" },
      { locale: "es", caminho: "/es/preguntas-frecuentes" },
    ]);
  });

  it("o índice do blog oferece os três, e o português mantém a barra final", () => {
    // A barra de `/blog/` é a canônica herdada do WordPress, e o cluster do índice
    // precisa apontar para ela: `/blog` sem barra serve, mas não é a canônica.
    const esperado = [
      { locale: "pt-BR", caminho: "/blog/" },
      { locale: "en", caminho: "/en/blog" },
      { locale: "es", caminho: "/es/blog" },
    ];
    expect(alternativasDeIdioma({ pathname: "/blog/", dados: null })).toEqual(esperado);
    expect(alternativasDeIdioma({ pathname: "/en/blog", dados: null })).toEqual(esperado);
  });

  it("índice sem rota traduzida não oferece troca", () => {
    // `/estacionamentos` existe só em português; oferecer troca levaria a 404.
    expect(alternativasDeIdioma({ pathname: "/estacionamentos", dados: null })).toEqual([]);
  });
});
