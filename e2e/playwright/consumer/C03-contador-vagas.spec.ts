/**
 * C-03 do roteiro do consumidor: o contador do topo da busca bate com a lista.
 *
 * Corrigido na E2.1.3 (86ajmwawc): a busca deixou de agrupar por unidade e passou
 * a exibir um card por `location_parking_type`, a mesma unidade de paginação da
 * Edge. Antes o topo dizia "36 vagas" e a lista mostrava 18 cards agrupados, e
 * dois tipos da mesma unidade podiam cair em páginas diferentes.
 *
 * Só LÊ. Não cria reserva nem cobrança.
 */
import { test, expect } from "@playwright/test";
import { ABBAPARK, searchUrl } from "../support/consumer";

test("C-03: o contador do topo bate com o número de cards", async ({ page }) => {
  await page.goto(searchUrl(ABBAPARK));

  const cards = page.getByTestId("result-card");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });

  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  const match = heading.match(/(\d+)\s+vagas?/);
  expect(match, `não achei o número no título da busca: "${heading}"`).not.toBeNull();

  const announced = Number(match![1]);
  const shown = await cards.count();

  expect(
    announced,
    `o topo anuncia ${announced} e a lista mostra ${shown} cards`,
  ).toBe(shown);
});
