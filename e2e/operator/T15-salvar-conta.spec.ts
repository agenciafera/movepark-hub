/**
 * T-15 do roteiro E1.3: concluir o wizard grava a conta de recebimento.
 *
 * Percorre os 4 passos do KYC e submete. O estado esperado depois: uma linha em
 * `company_payout_account` e a tela avançando para o contrato.
 *
 * A consulta de CNPJ é interceptada (ver `support/kycForm.ts`), então o passo 1
 * não depende de rede de terceiro.
 *
 * ESCREVE em produção: semeia a company da fixture e grava a conta de repasse.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, getPayoutAccount, seedFixtureCompany } from "../support/db";
import {
  fillAddress,
  fillBankStepAndSubmit,
  fillCompanyStep,
  fillRepresentativeStep,
  field,
  stubCnpjLookup,
} from "../support/kycForm";

// O formulário é longo e a submissão passa por Edge Function.
test.setTimeout(90_000);

let companyId: string;

test.beforeEach(async ({ page }) => {
  await cleanupFixture();
  companyId = await seedFixtureCompany("approved");
  await stubCnpjLookup(page);
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-15: os 4 passos gravam a conta e a tela vai para o contrato", async ({ page }) => {
  // Pré-condição do roteiro: sem conta de repasse para a empresa.
  expect(await getPayoutAccount(companyId)).toBeNull();

  await page.goto("/operator/recebimento");
  await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });

  await fillCompanyStep(page);

  await expect(field(page, "Ponto de referência")).toBeVisible({ timeout: 15_000 });
  await fillAddress(page);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(field(page, "CPF")).toBeVisible({ timeout: 15_000 });
  await fillRepresentativeStep(page);

  await expect(field(page, "Banco")).toBeVisible({ timeout: 15_000 });
  await fillBankStepAndSubmit(page);

  // A tela avança para o contrato.
  await expect(page.getByRole("heading", { name: "Contrato de parceria" })).toBeVisible({
    timeout: 30_000,
  });

  // E o estado no banco acompanha: exatamente uma conta de repasse.
  const account = await getPayoutAccount(companyId);
  expect(account, "o passo 4 deveria ter gravado a conta de recebimento").not.toBeNull();
});
