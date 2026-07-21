/**
 * C-02 do roteiro do consumidor: o card da busca separa benefício de tipo de vaga.
 *
 * ESTE SPEC ESTÁ MARCADO COM `test.fail()` DE PROPÓSITO.
 *
 * A asserção descreve o comportamento CORRETO, que hoje não existe. Enquanto o
 * defeito estiver de pé, o Playwright espera a falha e a suíte fica verde. No dia
 * em que a correção entrar, o teste passa, o `test.fail()` acusa "passou mas era
 * pra falhar", e alguém remove a marca. É o aceite da tarefa ClickUp 86ajmwawc.
 *
 * O defeito observado em 21/07/2026 (`GroupedResultCard.tsx:222` e `:236-247`):
 *   1. os nomes dos tipos vêm concatenados como texto solto na linha de
 *      endereço, que é `line-clamp-1` e trunca;
 *   2. o pill de benefício "Coberto" aparece no mesmo card cujos tipos incluem
 *      "Vaga Descoberta".
 *
 * A causa dos dois é a mesma do C-04: `covered` existe como código de AMENIDADE
 * (`location_amenity`) e como código de TIPO DE VAGA (`parking_type`). São
 * tabelas diferentes renderizadas lado a lado. Quem corrigir precisa tratar as
 * duas, não só uma.
 *
 * Só LÊ. Não cria reserva nem cobrança.
 */
import { test, expect } from "@playwright/test";
import { ABBAPARK, listActiveParkingTypes, searchUrl } from "../support/consumer";

test.fail();

test("C-02: card do Abbapark não mistura tipo de vaga com benefício", async ({ page }) => {
  const types = await listActiveParkingTypes(ABBAPARK);
  const typeNames = types.map((t) => t.name);
  expect(typeNames, "a fixture precisa ter mais de um tipo ativo").not.toHaveLength(0);
  expect(typeNames).toContain("Vaga Descoberta");

  await page.goto(searchUrl(ABBAPARK));

  const card = page
    .getByTestId("result-card")
    .filter({ has: page.getByRole("heading", { name: ABBAPARK.operatorName, exact: true }) })
    .first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  // 1. Os tipos de vaga não podem estar concatenados na linha de endereço.
  //    Quando existirem como elemento próprio, essa linha volta a ser só
  //    unidade e distância.
  const subline = (await card.getByTestId("result-card-subline").innerText()).trim();
  for (const name of typeNames) {
    expect(subline, `a linha de endereço não deveria conter o tipo "${name}": ${subline}`)
      .not.toContain(name);
  }

  // 2. "Coberto" é benefício da unidade. Num card cujos tipos incluem "Vaga
  //    Descoberta", exibi-lo como benefício contradiz o que está sendo vendido.
  const amenities = card.getByTestId("result-card-amenities");
  if (await amenities.count()) {
    const pills = (await amenities.innerText()).trim();
    expect(pills, `benefício "Coberto" ao lado de "Vaga Descoberta": ${pills}`)
      .not.toContain("Coberto");
  }
});
