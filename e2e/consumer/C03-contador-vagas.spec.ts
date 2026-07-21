/**
 * C-03 do roteiro do consumidor: o contador do topo da busca bate com a lista.
 *
 * ESTE SPEC ESTÁ MARCADO COM `test.fail()` DE PROPÓSITO, pelo mesmo motivo do
 * C-02: a asserção descreve o comportamento correto, que hoje não existe.
 *
 * Observado em 21/07/2026: o topo diz "36 vagas em <destino>" e a lista mostra
 * 18 cards. A Edge pagina por `location_parking_type`, não por location
 * (`supabase/functions/search/index.ts:346-349`), então `total`, `limit` e
 * `offset` contam vagas enquanto o agrupamento acontece no cliente
 * (`useSearchResults.ts:120`).
 *
 * O efeito grave não é o número, é a PAGINAÇÃO: dois tipos da mesma unidade
 * podem cair em páginas diferentes e a unidade aparece duas vezes, cada vez com
 * parte dos tipos.
 *
 * Só LÊ. Não cria reserva nem cobrança.
 */
import { test, expect } from "@playwright/test";
import { ABBAPARK, searchUrl } from "../support/consumer";

test.fail();

test("C-03: o contador do topo conta estacionamento, não vaga", async ({ page }) => {
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
