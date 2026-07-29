/**
 * C-02 do roteiro do consumidor: o card da busca separa benefício de tipo de vaga.
 *
 * Corrigido na E2.1.3 (86ajmwawc): a busca passou a exibir um card por
 * `location_parking_type`, e os descritores de tipo (`covered` e cia.) saem das
 * pills de amenidade. O `covered` existia como código de AMENIDADE
 * (`location_amenity`) e como TIPO DE VAGA (`parking_type`); a correção trata as
 * duas fontes (o card, aqui, e a página da unidade, no C-04).
 *
 * Só LÊ. Não cria reserva nem cobrança.
 */
import { test, expect } from "@playwright/test";
import { ABBAPARK, listActiveParkingTypes, searchUrl } from "../support/consumer";

test("C-02: cada tipo de vaga do Abbapark é um card, sem benefício contraditório", async ({
  page,
}) => {
  const types = await listActiveParkingTypes(ABBAPARK);
  const typeNames = types.map((t) => t.name);
  expect(typeNames.length, "a fixture precisa ter mais de um tipo ativo").toBeGreaterThan(1);
  expect(typeNames).toContain("Vaga Descoberta");

  await page.goto(searchUrl(ABBAPARK));

  const abbaparkCards = page
    .getByTestId("result-card")
    .filter({ has: page.getByRole("heading", { name: ABBAPARK.operatorName, exact: true }) });
  await expect(abbaparkCards.first()).toBeVisible({ timeout: 30_000 });

  // 1. Um card por tipo de vaga (decisão da reunião de 21/07). Hoje o
  //    agrupamento no cliente devolve 1 card só.
  await expect(
    abbaparkCards,
    `esperava ${typeNames.length} cards do Abbapark, um por tipo (${typeNames.join(", ")})`,
  ).toHaveCount(typeNames.length);

  // 2. Nenhum card pode exibir benefício que contradiga o próprio tipo. O caso
  //    concreto: "Coberto" é amenidade da UNIDADE e não pode aparecer no card
  //    cujo tipo é "Vaga Descoberta".
  const descoberta = abbaparkCards.filter({ hasText: "Vaga Descoberta" }).first();
  await expect(descoberta, "não achei o card da vaga descoberta").toBeVisible();

  const amenities = descoberta.getByTestId("result-card-amenities");
  if (await amenities.count()) {
    const pills = (await amenities.innerText()).trim();
    expect(pills, `benefício "Coberto" no card da vaga descoberta: ${pills}`).not.toContain(
      "Coberto",
    );
  }
});
