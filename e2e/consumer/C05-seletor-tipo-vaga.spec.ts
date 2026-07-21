/**
 * C-05 do roteiro do consumidor: o detalhe permite escolher o tipo de vaga.
 *
 * ESTE SPEC ESTÁ EM `test.fixme()`: o recurso NÃO EXISTE hoje, então não há o
 * que automatizar. Ele já entra escrito porque vira o teste de aceite da tarefa
 * ClickUp 86ajmwawc: quem entregar o seletor tira o `fixme` e este spec passa a
 * guardar o comportamento.
 *
 * Verificado em 21/07/2026: o tipo é o próprio recurso da rota
 * (`/p/:operator/:location/:parkingTypeCode`, `src/routes.tsx:182`) e a página
 * inteira é de um único `location_parking_type`. Os seletores do card de
 * reserva são datas, tarifa, add-ons, passageiros e cupom. Nenhum troca o tipo.
 *
 * Por que isso importa: o card da busca sempre linka pro tipo mais barato
 * (`cheapest_type.code`, `GroupedResultCard.tsx:100`). Somado à ausência do
 * seletor, não há caminho pela UI para comprar vaga coberta numa unidade onde a
 * descoberta é mais barata. Só editando a URL na mão. É o achado de maior
 * impacto comercial do roteiro.
 *
 * Não é falha de dado: `item.parking_types` já chega completo no card. A lista
 * está lá e não é usada.
 *
 * Quando o seletor existir, ele precisa de uma âncora estável. A esperada aqui é
 * `data-testid="listing-parking-type-selector"`.
 */
import { test, expect } from "@playwright/test";
import { ABBAPARK, listActiveParkingTypes, listingUrl } from "../support/consumer";

test.fixme(true, "O seletor de tipo de vaga ainda não existe (tarefa ClickUp 86ajmwawc).");

test("C-05: o detalhe troca de tipo de vaga sem perder as datas", async ({ page }) => {
  const types = await listActiveParkingTypes(ABBAPARK);
  expect(types.length).toBeGreaterThan(1);

  await page.goto(listingUrl(ABBAPARK, "uncovered"));

  const selector = page.getByTestId("listing-parking-type-selector");
  await expect(selector).toBeVisible({ timeout: 30_000 });

  // Todo tipo ativo da unidade tem que ser alcançável pela UI, não só o mais barato.
  for (const type of types) {
    await expect(selector.getByText(type.name, { exact: true })).toBeVisible();
  }

  // Trocar o tipo atualiza a página sem descartar o que já foi escolhido.
  await selector.getByText("Vaga Coberta", { exact: true }).click();
  await expect(page.getByTestId("listing-type-description")).toContainText("coberta");
});
