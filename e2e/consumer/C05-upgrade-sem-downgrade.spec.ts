/**
 * C-05 do roteiro do consumidor: o detalhe induz upgrade e nunca oferece downgrade.
 *
 * ESTE CASO TROCOU DE NATUREZA em 21/07/2026. A versão anterior cobrava um seletor
 * de tipo de vaga no detalhe (`listing-parking-type-selector`). A reunião das 15:03
 * descartou o seletor: a escolha do tipo passa a acontecer na BUSCA, num card por
 * tipo, e o detalhe só empurra para cima.
 *
 * Decisão registrada na tarefa https://app.clickup.com/t/86ajmwawc
 *
 * ESTE SPEC ESTÁ EM `test.fixme()`: nada disso existe hoje. Ele entra escrito para
 * ser o teste de aceite. Quem entregar tira o `fixme`.
 *
 * O comportamento esperado é ASSIMÉTRICO de propósito:
 *   - na página do tipo mais BARATO, existe indução a upgrade com a diferença de
 *     preço explícita ("por mais R$ X, cubra seu carro");
 *   - na página do tipo mais CARO, NÃO existe nenhuma oferta do mais barato.
 *
 * A assimetria é a decisão, não um bug. Pedro registrou na reunião que é um dark
 * pattern consciente. Um teste "simétrico" aqui reprovaria o que foi pedido.
 *
 * Atenção de quem for implementar: o upgrade de VAGA não é o upgrade de TARIFA.
 * O `apply_fare_upgrade` troca Básica/Flex/Superflex e não encosta no tipo de vaga.
 * Trocar descoberta por coberta muda o `location_parking_type_id`, o que mexe em
 * capacidade nos DOIS tipos, em preço vindo de outro `pricing_rule` e em
 * disponibilidade na data.
 *
 * Âncoras esperadas quando existir:
 *   - `listing-upgrade-offer`        (o bloco de indução)
 *   - `listing-upgrade-price-delta`  (a diferença, que precisa ser explícita)
 */
import { test, expect } from "@playwright/test";
import { ABBAPARK, listActiveParkingTypes, listingUrl } from "../support/consumer";

test.fixme(true, "Indução a upgrade no detalhe ainda não existe (tarefa ClickUp 86ajmwawc).");

test.describe("C-05", () => {
  test("C-05a: na vaga mais barata, o detalhe induz o upgrade com a diferença explícita", async ({
    page,
  }) => {
    // `listActiveParkingTypes` já devolve ordenado por `basePrice` crescente.
    const types = await listActiveParkingTypes(ABBAPARK);
    expect(types.length, "a fixture precisa de mais de um tipo ativo").toBeGreaterThan(1);
    const cheapest = types[0];

    await page.goto(listingUrl(ABBAPARK, cheapest.code));

    await expect(page.getByTestId("listing-upgrade-offer")).toBeVisible({ timeout: 30_000 });

    // A diferença precisa estar na tela. "Faça upgrade" sem preço não deixa o
    // cliente decidir, e foi justamente o exemplo discutido na reunião.
    await expect(page.getByTestId("listing-upgrade-price-delta")).toContainText(/R\$/);
  });

  test("C-05b: na vaga mais cara, NÃO existe oferta de downgrade", async ({ page }) => {
    const types = await listActiveParkingTypes(ABBAPARK);
    expect(types.length, "a fixture precisa de mais de um tipo ativo").toBeGreaterThan(1);
    const cheapest = types[0];
    const priciest = types[types.length - 1];

    await page.goto(listingUrl(ABBAPARK, priciest.code));

    // Quem já está no tipo melhor não é puxado para baixo. Este assert é o que
    // diferencia "induzir upgrade" de "seletor de tipo", que foi descartado.
    await expect(page.getByTestId("listing-upgrade-offer")).toHaveCount(0);
    await expect(page.getByText(cheapest.name, { exact: true })).toHaveCount(0);
  });
});
