/**
 * C-01 do roteiro do consumidor: a vitrine da home agrupa por estacionamento.
 *
 * Prova que nenhum estacionamento aparece em dois cards. O dedupe roda em
 * `dedupePopularOffers` (`src/features/search/api.ts`), que guarda só a oferta
 * mais barata por location.
 *
 * Só LÊ. Não cria reserva nem cobrança.
 *
 * Armadilha do roteiro: passar aqui não prova que os outros tipos de vaga da
 * unidade existem, só que não há card repetido. O card fica preso a um tipo.
 */
import { test, expect } from "@playwright/test";

test("C-01: nenhum estacionamento aparece em dois cards da vitrine", async ({ page }) => {
  await page.goto("/");

  const section = page.getByTestId("popular-parking-lots");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await section.scrollIntoViewIfNeeded();

  const cards = section.getByTestId("popular-card");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });

  // A identidade do card é o par empresa/unidade do link, não o texto: dois
  // cards da mesma unidade com tipos diferentes teriam nomes iguais na tela mas
  // links diferentes, e é justamente isso que o dedupe tem que impedir.
  //
  // Um href POR CARD: cada card tem dois links pro mesmo destino (a imagem e o
  // corpo). Coletar todos faria o teste acusar duplicata onde ela não existe.
  const hrefs = await cards.evaluateAll((articles) =>
    articles.map(
      (article) => article.querySelector<HTMLAnchorElement>("a[href^='/p/']")?.getAttribute("href") ?? "",
    ),
  );

  const units = hrefs
    .map((href) => href.split("?")[0].split("/").slice(2, 4).join("/"))
    .filter(Boolean);

  const seen = new Set<string>();
  const duplicated = units.filter((u) => (seen.has(u) ? true : (seen.add(u), false)));

  expect(duplicated, `unidades repetidas na vitrine: ${[...new Set(duplicated)].join(", ")}`)
    .toEqual([]);

  // Todo card leva pra rota de detalhe com tipo de vaga.
  for (const href of hrefs) {
    expect(href).toMatch(/^\/p\/[^/]+\/[^/]+\/[^/?]+/);
  }
});
