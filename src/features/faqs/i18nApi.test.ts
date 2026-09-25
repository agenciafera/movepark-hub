import { describe, expect, it } from "vitest";

import type { FaqTraducao } from "./i18nApi";
import { idiomasDaFaq } from "./i18nApi";

const t = (over: Partial<FaqTraducao>): FaqTraducao => ({
  faq_id: "f1",
  locale: "en",
  slug: "how-much",
  question: "How much?",
  answer: "A lot.",
  body_md: null,
  ...over,
});

describe("idiomasDaFaq", () => {
  /**
   * A regra que nasceu do hreflang que foi a produção apontando para 404 em
   * 25/09/2026: toda vez que uma URL é montada a partir de um dado que tem versão por
   * idioma, o idioma tem que estar no tipo. Aqui o slug viaja junto, sempre.
   */
  it("devolve o slug de cada idioma, não só o idioma", () => {
    const todas = [
      t({ locale: "en", slug: "how-much" }),
      t({ locale: "es", slug: "cuanto-cuesta" }),
    ];
    expect(idiomasDaFaq(todas, "f1")).toEqual([
      { locale: "en", slug: "how-much" },
      { locale: "es", slug: "cuanto-cuesta" },
    ]);
  });

  it("descarta tradução sem slug, que não tem URL naquele idioma", () => {
    // Listar no hreflang uma alternativa sem endereço é o mesmo 404 com outra roupa.
    const todas = [t({ locale: "en", slug: "" }), t({ locale: "es", slug: "cuanto" })];
    expect(idiomasDaFaq(todas, "f1")).toEqual([{ locale: "es", slug: "cuanto" }]);
  });

  it("separa por pergunta", () => {
    const todas = [t({ faq_id: "f1" }), t({ faq_id: "f2", locale: "es", slug: "otra" })];
    expect(idiomasDaFaq(todas, "f1").map((i) => i.locale)).toEqual(["en"]);
    expect(idiomasDaFaq(todas, "f2").map((i) => i.locale)).toEqual(["es"]);
  });

  it("ordem estável, independente da ordem do banco", () => {
    const fora = [t({ locale: "es", slug: "b" }), t({ locale: "en", slug: "a" })];
    expect(idiomasDaFaq(fora, "f1").map((i) => i.locale)).toEqual(["en", "es"]);
  });

  it("pergunta sem tradução não gera cluster", () => {
    expect(idiomasDaFaq([], "f1")).toEqual([]);
  });
});
