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
    expect(idiomasDoDestino(todas, "d1")).toEqual(["en"]);
    expect(idiomasDoDestino(todas, "d2")).toEqual(["es"]);
  });

  it("mantém ordem estável, independente da ordem do banco", () => {
    const fora = [t({ locale: "es" }), t({ locale: "en" })];
    expect(idiomasDoDestino(fora, "d1")).toEqual(["en", "es"]);
  });

  it("destino sem tradução devolve vazio, e aí não há cluster", () => {
    expect(idiomasDoDestino([], "d1")).toEqual([]);
  });
});
