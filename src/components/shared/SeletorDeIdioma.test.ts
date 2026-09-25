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

  it("sem slug em português não monta nada, em vez de montar `/faq/undefined`", () => {
    expect(
      alternativasDeIdioma({
        pathname: "/en/faq/x",
        dados: { idiomas: [{ locale: "en", slug: "x" }] },
      }),
    ).toEqual([]);
  });
});
