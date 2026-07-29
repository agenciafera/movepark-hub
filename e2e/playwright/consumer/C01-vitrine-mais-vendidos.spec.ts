/**
 * C-01 do roteiro do consumidor: a vitrine da home lista os tipos de vaga mais
 * vendidos, no máximo um por EMPRESA.
 *
 * ESTE CASO TROCOU DE NATUREZA em 22/07/2026. Antes exigia o oposto: que nenhuma
 * unidade aparecesse em dois cards, porque a home agrupava por location
 * (`dedupePopularOffers`). A decisão nova mantém o card como TIPO DE VAGA, igual
 * à busca, e ordena pelo que mais vende, com teto de um card por empresa.
 *
 * Decisão registrada em https://app.clickup.com/t/86ajneu1c
 *
 * O caso está partido em dois de propósito:
 *
 *   C-01a — teto de 1 por empresa. Fica ATIVO, porque a propriedade já vale hoje
 *           (por coincidência: o 7º colocado é a 2ª unidade do Aerovalet, e ele
 *           fica fora do corte de 6). Ativo, ele pega a regressão no dia em que
 *           duas unidades da mesma empresa entrarem no top.
 *
 *   C-01b — ordem por venda DO TIPO. A home ranqueia por (unidade, tipo de vaga)
 *           via a RPC `popular_parking_types` e destaca o tipo mais vendido de
 *           cada empresa (dedupePopularOffers com teto de 1 por empresa).
 *           Implementado em 86ajnfwgx.
 *
 * Por que o teto é por EMPRESA e não por unidade: a home é vitrine curta de
 * destaques (6 cards), não lista exaustiva. Sem teto, uma empresa com 3 tipos
 * ativos ocuparia metade dela. Há 15 empresas elegíveis disputando 6 slots, então
 * o teto de 1 mantém variedade sem esvaziar a vitrine.
 *
 * Só LÊ. Não cria reserva nem cobrança.
 */
import { test, expect, type Page } from "@playwright/test";
import { admin } from "../support/supabaseAdmin";

/** Um href por card (cada card tem dois links pro mesmo destino: imagem e corpo). */
async function vitrineHrefs(page: Page): Promise<string[]> {
  await page.goto("/");
  const section = page.getByTestId("popular-parking-lots");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await section.scrollIntoViewIfNeeded();

  const cards = section.getByTestId("popular-card");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });

  return cards.evaluateAll((articles) =>
    articles.map(
      (article) =>
        article.querySelector<HTMLAnchorElement>("a[href^='/p/']")?.getAttribute("href") ?? "",
    ),
  );
}

/** `/p/operador/unidade/tipo` → as três partes. */
function parseHref(href: string) {
  const [, , operador, unidade, tipo] = href.split("?")[0].split("/");
  return { operador, unidade, tipo };
}

test.describe("C-01", () => {
  test("C-01a: a vitrine não repete empresa", async ({ page }) => {
    const hrefs = await vitrineHrefs(page);

    for (const href of hrefs) {
      expect(href, "todo card leva pra rota de detalhe com tipo de vaga").toMatch(
        /^\/p\/[^/]+\/[^/]+\/[^/?]+/,
      );
    }

    const empresas = hrefs.map((h) => parseHref(h).operador).filter(Boolean);
    const seen = new Set<string>();
    const repetidas = empresas.filter((e) => (seen.has(e) ? true : (seen.add(e), false)));

    expect(
      repetidas,
      `empresa repetida na vitrine: ${[...new Set(repetidas)].join(", ")}. ` +
        "A home aceita no máximo um card por empresa.",
    ).toEqual([]);
  });

  test("C-01b: cada card traz o tipo de vaga MAIS VENDIDO daquela empresa", async ({ page }) => {
    // A home ranqueia por (unidade, tipo de vaga) via `popular_parking_types` e
    // destaca o tipo mais vendido de cada empresa. Este teste compara o que a
    // vitrine mostra contra o ranking do banco.
    const hrefs = await vitrineHrefs(page);
    expect(hrefs.length, "a vitrine precisa ter cards para comparar").toBeGreaterThan(0);

    // Ranking esperado, direto do banco: reservas por (unidade, tipo de vaga).
    const { data, error } = await admin.rpc("popular_parking_types", { p_limit: 24 });
    if (error) {
      throw new Error(`RPC popular_parking_types falhou (${error.message}).`);
    }

    const melhorPorEmpresa = new Map<string, string>();
    const linhas = (data ?? []) as unknown as { operator_slug: string; parking_type_code: string }[];
    for (const row of linhas) {
      if (!melhorPorEmpresa.has(row.operator_slug)) {
        melhorPorEmpresa.set(row.operator_slug, row.parking_type_code);
      }
    }

    for (const href of hrefs) {
      const { operador, tipo } = parseHref(href);
      const esperado = melhorPorEmpresa.get(operador);
      expect(
        tipo,
        `${operador}: a vitrine mostra "${tipo}" mas o mais vendido da empresa é "${esperado}"`,
      ).toBe(esperado);
    }
  });
});
