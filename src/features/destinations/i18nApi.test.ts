import { describe, expect, it } from "vitest";

import type { DestinoTraduzido } from "./i18nApi";
import { idiomasDoDestino, slugDoIdioma } from "./i18nApi";

const t = (over: Partial<DestinoTraduzido>): DestinoTraduzido => ({
  destination_id: "d1",
  locale: "en",
  slug: null,
  seo_label: null,
  meta_title: null,
  meta_description: null,
  intro: null,
  ...over,
});

describe("slugDoIdioma", () => {
  it("usa o slug do idioma quando existe", () => {
    expect(slugDoIdioma(t({ slug: "guarulhos-airport" }), "aeroporto-guarulhos")).toBe(
      "guarulhos-airport",
    );
  });

  it("cai no slug original quando a tradução não tem slug próprio", () => {
    expect(slugDoIdioma(t({ slug: null }), "aeroporto-guarulhos")).toBe("aeroporto-guarulhos");
    expect(slugDoIdioma(t({ slug: "   " }), "aeroporto-guarulhos")).toBe("aeroporto-guarulhos");
    expect(slugDoIdioma(undefined, "aeroporto-guarulhos")).toBe("aeroporto-guarulhos");
  });
});

describe("idiomasDoDestino", () => {
  it("lista só os idiomas que voltaram da consulta", () => {
    // A consulta já é filtrada pela RLS, então tradução em rascunho não chega aqui e
    // por consequência não vira hreflang.
    const todas = [t({ locale: "en" }), t({ destination_id: "d2", locale: "es" })];
    expect(idiomasDoDestino(todas, "d1", "pt").map((i) => i.locale)).toEqual(["en"]);
    expect(idiomasDoDestino(todas, "d2", "pt").map((i) => i.locale)).toEqual(["es"]);
  });

  it("carrega o SLUG de cada idioma, não só o idioma", () => {
    /*
     * O bug que foi a produção em 25/09/2026: a função devolvia só a lista de
     * idiomas, a página montava o caminho com o slug português para todos, e o
     * cluster de hreflang apontava `/en/airport-parking/aeroporto-guarulhos`, que é
     * 404, enquanto a página real era `/en/airport-parking/guarulhos-airport`. O
     * cluster prometia tradução e entregava página inexistente.
     */
    const todas = [
      t({ locale: "en", slug: "guarulhos-airport" }),
      t({ locale: "es", slug: "aeropuerto-guarulhos" }),
    ];
    expect(idiomasDoDestino(todas, "d1", "aeroporto-guarulhos")).toEqual([
      { locale: "en", slug: "guarulhos-airport" },
      { locale: "es", slug: "aeropuerto-guarulhos" },
    ]);
  });

  it("sem slug próprio, cai no slug original", () => {
    expect(idiomasDoDestino([t({ locale: "en", slug: null })], "d1", "aeroporto-guarulhos")).toEqual(
      [{ locale: "en", slug: "aeroporto-guarulhos" }],
    );
  });

  it("mantém ordem estável, independente da ordem do banco", () => {
    const fora = [t({ locale: "es" }), t({ locale: "en" })];
    expect(idiomasDoDestino(fora, "d1", "pt").map((i) => i.locale)).toEqual(["en", "es"]);
  });

  it("destino sem tradução devolve vazio, e aí não há cluster", () => {
    expect(idiomasDoDestino([], "d1", "pt")).toEqual([]);
  });
});
