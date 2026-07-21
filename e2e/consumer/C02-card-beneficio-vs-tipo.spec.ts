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
