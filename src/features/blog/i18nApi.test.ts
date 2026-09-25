import { describe, expect, it } from "vitest";

import type { PostTraducao } from "./i18nApi";
import { idiomasDoPost } from "./i18nApi";

const t = (over: Partial<PostTraducao>): PostTraducao => ({
  blog_post_id: "p1",
  locale: "en",
  slug: "cheap-parking-gru",
  title: "Cheap parking at GRU",
  excerpt: null,
  meta_title: null,
  meta_description: null,
  body_md: "# Cheap parking\n\nText.",
  ...over,
});

describe("idiomasDoPost", () => {
  /**
   * A regra que nasceu do hreflang que foi a produção apontando para 404 em
   * 25/09/2026: toda URL montada a partir de um dado com versão por idioma carrega
   * o idioma no tipo. Aqui o slug viaja junto, sempre.
   */
  it("devolve o slug de cada idioma, não só o idioma", () => {
    const todas = [
      t({ locale: "en", slug: "cheap-parking-gru" }),
      t({ locale: "es", slug: "estacionamiento-barato-gru" }),
    ];
    expect(idiomasDoPost(todas, "p1")).toEqual([
      { locale: "en", slug: "cheap-parking-gru" },
      { locale: "es", slug: "estacionamiento-barato-gru" },
    ]);
  });

  it("descarta tradução sem slug, que não tem URL naquele idioma", () => {
    const todas = [t({ locale: "en", slug: "" }), t({ locale: "es", slug: "barato" })];
    expect(idiomasDoPost(todas, "p1")).toEqual([{ locale: "es", slug: "barato" }]);
  });

  it("descarta tradução sem corpo, que renderizaria post em português", () => {
    // Manchete em inglês sobre texto em português é pior que não ter a página: o
    // leitor clica esperando uma coisa e recebe outra, e o Google indexa a mistura.
    const todas = [
      t({ locale: "en", body_md: "" }),
      t({ locale: "es", slug: "barato", body_md: "Texto." }),
    ];
    expect(idiomasDoPost(todas, "p1")).toEqual([{ locale: "es", slug: "barato" }]);
  });

  it("descarta tradução sem título, pelo mesmo motivo", () => {
    expect(idiomasDoPost([t({ title: "" })], "p1")).toEqual([]);
  });

  it("separa por post", () => {
    const todas = [t({ blog_post_id: "p1" }), t({ blog_post_id: "p2", locale: "es", slug: "otro" })];
    expect(idiomasDoPost(todas, "p1").map((i) => i.locale)).toEqual(["en"]);
    expect(idiomasDoPost(todas, "p2").map((i) => i.locale)).toEqual(["es"]);
  });

  it("ordem estável, independente da ordem do banco", () => {
    const fora = [t({ locale: "es", slug: "b" }), t({ locale: "en", slug: "a" })];
    expect(idiomasDoPost(fora, "p1").map((i) => i.locale)).toEqual(["en", "es"]);
  });

  it("post sem tradução não gera cluster", () => {
    expect(idiomasDoPost([], "p1")).toEqual([]);
  });
});
