import { describe, expect, it } from "vitest";

import { fetchDestinosTraduzidos } from "@/features/destinations/i18nApi";
import { fetchFaqBySlug, fetchFaqIndex } from "@/features/faqs/api";
import { fetchTraducoesDeFaq } from "@/features/faqs/i18nApi";
import { tabela } from "@/test/msw/supabase";

/**
 * As três leituras de tabela inteira que o build fazia uma vez por página.
 *
 * Medido no log em 27/11/2026: ~1.700 chamadas de cada uma por build, num total de
 * ~5.000 das ~15.800 consultas, e oito builds seguidos derrubaram a instância do banco.
 * Cada página continua recebendo a lista inteira; o que muda é que o banco é lido uma
 * vez só.
 */
describe("leituras de tabela inteira no build", () => {
  it("fetchTraducoesDeFaq lê o banco uma vez para várias páginas", async () => {
    const espiao = tabela("faq_i18n", "get", {
      json: [{ faq_id: "f1", locale: "en", slug: "how", question: "Q", answer: "A", body_md: null }],
    });

    const r = await Promise.all([fetchTraducoesDeFaq(), fetchTraducoesDeFaq()]);
    await fetchTraducoesDeFaq();

    expect(espiao.chamadas).toHaveLength(1);
    expect(r[0]).toHaveLength(1);
  });

  it("fetchDestinosTraduzidos lê o banco uma vez para várias páginas", async () => {
    const espiao = tabela("destination_i18n", "get", { json: [{ destination_id: "d1" }] });

    await Promise.all([fetchDestinosTraduzidos(), fetchDestinosTraduzidos()]);
    await fetchDestinosTraduzidos();

    expect(espiao.chamadas).toHaveLength(1);
  });

  it("fetchFaqIndex lê o banco uma vez, inclusive quando vem de fetchFaqBySlug", async () => {
    // O índice também é lido por dentro de cada /faq/<slug> (relacionadas), que é onde
    // estava o grosso das ~1.700 leituras.
    const indice = tabela("faq", "get", {
      json: [
        {
          id: "f1",
          scope: "global",
          destination_id: null,
          question: "Q",
          answer: "A",
          slug: "q",
          sort_order: 1,
          category: null,
          destination: null,
        },
      ],
    });

    await fetchFaqIndex();
    await fetchFaqIndex();

    expect(indice.chamadas).toHaveLength(1);
  });

  it("devolve cópia da lista: quem ordena no lugar não bagunça a página seguinte", async () => {
    tabela("faq_i18n", "get", {
      json: [
        { faq_id: "f2", locale: "en", slug: "b", question: "Q", answer: "A", body_md: null },
        { faq_id: "f1", locale: "en", slug: "a", question: "Q", answer: "A", body_md: null },
      ],
    });

    const primeira = await fetchTraducoesDeFaq();
    primeira.sort((x, y) => x.slug.localeCompare(y.slug));
    const segunda = await fetchTraducoesDeFaq();

    expect(segunda.map((t) => t.slug)).toEqual(["b", "a"]);
  });

  it("fetchFaqBySlug continua lendo a pergunta de cada página", async () => {
    // A leitura POR PÁGINA (uma linha) não entra no cache: ela é a única que muda de
    // página para página.
    const espiao = tabela("faq", "get", { json: [] });

    await fetchFaqBySlug("uma").catch(() => null);
    await fetchFaqBySlug("outra").catch(() => null);

    const porSlug = espiao.chamadas.filter((c) => c.url.includes("slug=eq."));
    expect(porSlug).toHaveLength(2);
  });
});
