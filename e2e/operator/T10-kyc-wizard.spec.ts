/**
 * T-10 do roteiro E1.3: estrutura do wizard de KYC e trava por passo.
 *
 * DIVERGÊNCIAS DO ROTEIRO, confirmadas no código:
 *
 *   - o roteiro descreve "wizard de 3 passos (Sua empresa, Representante
 *     legal, Conta bancária)". São **4**: Empresa, Endereço da empresa,
 *     Representante, Conta bancária (`PayoutKycWizard.tsx:25`);
 *   - o roteiro espera a barra "Passo X de 3". Ela não existe. O `SubStepBar`
 *     mostra os passos **por nome**, e o comentário do componente diz que é de
 *     propósito, para não recriar um "passo 1" a cada fase do cadastro
 *     (`src/components/shared/SubStepBar.tsx:6`).
 *
 * Este spec testa o que existe. Se o produto quiser mesmo a numeração, o teste
 * é que está certo e o componente é que muda.
 *
 * ESCREVE em produção: semeia a company da fixture. Não submete o formulário.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, seedFixtureCompany } from "../support/db";
import { field, stubCnpjLookup } from "../support/kycForm";

test.beforeEach(async ({ page }) => {
  await cleanupFixture();
  await seedFixtureCompany("approved");
  await stubCnpjLookup(page);
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-10: o wizard mostra os 4 passos por nome", async ({ page }) => {
  await page.goto("/operator/recebimento");
  await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });

  // Escopado ao form: alguns desses rótulos também aparecem fora do wizard.
  const wizard = page.locator("form");
  for (const titulo of ["Empresa", "Endereço da empresa", "Representante", "Conta bancária"]) {
    await expect(wizard.getByText(titulo, { exact: true })).toBeVisible();
  }

  // A numeração que o roteiro espera não existe. Ver o cabeçalho do arquivo.
  await expect(page.getByText(/Passo \d+ de \d+/)).toHaveCount(0);
});

test("T-10: não avança com os campos do passo vazios", async ({ page }) => {
  await page.goto("/operator/recebimento");
  await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });

  // Pré-condição: o primeiro passo está ativo e o CNPJ, vazio.
  const cnpj = field(page, "CNPJ").getByRole("textbox");
  await expect(cnpj).toBeVisible();
  await expect(cnpj).toHaveValue("");

  await page.getByRole("button", { name: "Continuar" }).click();

  // Continua no passo 1: o campo de CNPJ segue na tela e o de endereço não veio.
  await expect(cnpj).toBeVisible();
  await expect(field(page, "Ponto de referência")).toHaveCount(0);
});
