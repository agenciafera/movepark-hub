/**
 * C-04 do roteiro do consumidor: o detalhe informa corretamente coberto ou
 * descoberto.
 *
 * O defeito original (E2.1.3, 86ajmwawc): a página da vaga DESCOBERTA dizia "Vaga em área
 * aberta, sem cobertura" e três linhas abaixo listava "Coberto" entre os benefícios, porque o
 * bloco lê `location_amenity` (da UNIDADE) sob um título que promete falar da VAGA. Contradição
 * no exato ponto em que o cliente decide. Corrigido nas duas fontes, o card da busca e esta
 * página, filtrando os descritores de tipo da lista.
 *
 * O caso roda em DUAS unidades porque a proteção é contra o vazamento voltar em qualquer base,
 * não contra um dado específico.
 *
 * ATENÇÃO ao ler este arquivo: ele já teve o Abbapark como "caso" (a unidade que tinha a
 * amenidade `covered`) e o Maxi Park como controle. Hoje NENHUMA unidade tem essa amenidade, e
 * o código `covered` nem existe mais no catálogo `amenity`, então os dois lados viraram
 * controle. O caso segue valendo como rede de regressão, mas parou de reproduzir o defeito
 * original: para reproduzi-lo de novo é preciso primeiro recriar uma amenidade descritora de
 * tipo na unidade.
 *
 * Só LÊ. Não cria reserva nem cobrança.
 */
import { test, expect, type Page } from "@playwright/test";
import { AGENCIA_FERA, MAXI_PARK, listingUrl, type ConsumerFixture } from "../support/consumer";

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

test("C-04: Agência Fera descoberta não pode listar Coberto como benefício", async ({ page }) => {
  // Corrigido na E2.1.3 (86ajmwawc): a página da unidade filtra os descritores de
  // tipo (covered/valet/…) da lista de amenidades.
  await openUncovered(page, AGENCIA_FERA);

  const benefits = await benefitsText(page);
  expect(
    benefits,
    `a página diz "sem cobertura" e lista "Coberto" nos benefícios: ${benefits}`,
  ).not.toContain("Coberto");
});

test("C-04: Maxi Park descoberta também não lista Coberto", async ({ page }) => {
  await openUncovered(page, MAXI_PARK);

  const benefits = await benefitsText(page);
  expect(
    benefits,
    "descritor de tipo não pode entrar na lista de benefícios da unidade",
  ).not.toContain("Coberto");
});
