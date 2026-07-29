/**
 * C-04 do roteiro do consumidor: o detalhe informa corretamente coberto ou
 * descoberto.
 *
 * São dois casos, e o par é o que separa causa de sintoma:
 *
 *   - Abbapark: tem a amenidade `covered` na location. Antes da E2.1.3, a página
 *     da vaga DESCOBERTA dizia "Vaga em área aberta, sem cobertura" e três linhas
 *     abaixo listava "Coberto" entre os benefícios. Contradição no exato ponto em
 *     que o cliente decide.
 *   - Maxi Park (controle): mesmos tipos coberta e descoberta, sem a amenidade. A
 *     contradição nunca existiu. É a prova de que a causa é a amenidade da
 *     location vazando pro tipo de vaga, não o tipo em si.
 *
 * Corrigido na E2.1.3 (86ajmwawc), nas duas fontes: o card da busca e esta
 * página. O título diz "O que essa VAGA oferece", mas o conteúdo vem de
 * `location_amenity` (da UNIDADE), então os descritores de tipo são filtrados.
 *
 * Só LÊ. Não cria reserva nem cobrança.
 */
import { test, expect, type Page } from "@playwright/test";
import { ABBAPARK, MAXI_PARK, listingUrl, type ConsumerFixture } from "../support/consumer";

/** Texto do bloco de benefícios, ou string vazia quando a unidade não tem nenhum. */
async function benefitsText(page: Page): Promise<string> {
  const list = page.getByTestId("listing-amenities");
  if ((await list.count()) === 0) return "";
  return (await list.innerText()).trim();
}

async function openUncovered(page: Page, fixture: ConsumerFixture) {
  await page.goto(listingUrl(fixture, "uncovered"));

  await expect(page.getByRole("heading", { level: 1, name: fixture.operatorName })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Vaga Descoberta").first()).toBeVisible();

  const description = page.getByTestId("listing-type-description");
  await expect(description).toContainText("sem cobertura");
}

test("C-04: Abbapark descoberta não pode listar Coberto como benefício", async ({ page }) => {
  // Corrigido na E2.1.3 (86ajmwawc): a página da unidade filtra os descritores de
  // tipo (covered/valet/…) da lista de amenidades.
  await openUncovered(page, ABBAPARK);

  const benefits = await benefitsText(page);
  expect(
    benefits,
    `a página diz "sem cobertura" e lista "Coberto" nos benefícios: ${benefits}`,
  ).not.toContain("Coberto");
});

test("C-04 controle: Maxi Park descoberta não tem a contradição", async ({ page }) => {
  await openUncovered(page, MAXI_PARK);

  const benefits = await benefitsText(page);
  expect(
    benefits,
    "sem a amenidade `covered` na location, o benefício não deveria aparecer",
  ).not.toContain("Coberto");
});
