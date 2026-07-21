/**
 * T-11 do roteiro E1.3: complemento e ponto de referência são obrigatórios no
 * endereço da empresa.
 *
 * O roteiro cobre empresa e representante. Aqui só o endereço da empresa, que
 * é o passo 2. O do representante fica no T-15, que preenche o formulário
 * inteiro até submeter.
 *
 * A consulta de CNPJ é interceptada (ver `support/kycForm.ts`), então o passo 1
 * não depende de rede nem de dado cadastral de terceiro.
 *
 * ESCREVE em produção: semeia a company da fixture. Não submete o formulário.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, seedFixtureCompany } from "../support/db";
import { field, fillAddress, fillCompanyStep, stubCnpjLookup } from "../support/kycForm";

test.beforeEach(async ({ page }) => {
  await cleanupFixture();
  await seedFixtureCompany("approved");
  await stubCnpjLookup(page);

  await page.goto("/operator/recebimento");
  await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });
  await fillCompanyStep(page);

  // Chegou no passo de endereço.
  await expect(field(page, "Ponto de referência")).toBeVisible({ timeout: 15_000 });
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-11: sem complemento não avança", async ({ page }) => {
  await fillAddress(page, { complement: "" });
  await page.getByRole("button", { name: "Continuar" }).click();

  // Continua no endereço: o campo segue na tela e o representante não veio.
  await expect(field(page, "Complemento")).toBeVisible();
  await expect(field(page, "CPF")).toHaveCount(0);
});

test("T-11: sem ponto de referência não avança", async ({ page }) => {
  await fillAddress(page, { referencePoint: "" });
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(field(page, "Ponto de referência")).toBeVisible();
  await expect(field(page, "CPF")).toHaveCount(0);
});

test("T-11: com endereço completo avança para o representante", async ({ page }) => {
  await fillAddress(page);
  await page.getByRole("button", { name: "Continuar" }).click();

  // O passo do representante traz o CPF, que não existe em nenhum outro passo.
  await expect(field(page, "CPF")).toBeVisible({ timeout: 15_000 });
});
