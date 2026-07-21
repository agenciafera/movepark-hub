/**
 * T-02 do roteiro E1.3: submissão completa cria company e onboarding.
 *
 * Cobre os dois caminhos do roteiro: a primeira submissão (201, cria tudo) e a
 * repetida com o mesmo e-mail (200 `already_submitted`, sem recriar).
 *
 * Este spec ESCREVE no banco de produção, dentro do escopo da fixture Mercy.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, getCompany, getOnboarding } from "../support/db";
import { submitFullLead } from "../support/leadFlow";
import { FIXTURE_COMPANY_NAME, FIXTURE_EMAIL } from "../support/fixtures";

test.beforeEach(async () => {
  await cleanupFixture();
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-02: submissão completa cria company e company_onboarding", async ({ page }) => {
  expect(await getCompany()).toBeNull();

  const modal = await submitFullLead(page);
  await expect(modal.getByText("Recebemos seu cadastro")).toBeVisible();

  const company = await getCompany();
  expect(company, "a submissão deveria ter criado a company").not.toBeNull();
  expect(company!.name).toContain(FIXTURE_COMPANY_NAME);
  expect(company!.status).toBe("inactive");
  expect(company!.onboarding_status).toBe("pending_review");

  const onboarding = await getOnboarding();
  expect(onboarding, "a submissão deveria ter criado o company_onboarding").not.toBeNull();
  expect(onboarding!.contact_email).toBe(FIXTURE_EMAIL);
});

test("T-02: e-mail repetido não recria a company", async ({ page }) => {
  const first = await submitFullLead(page);
  await expect(first.getByText("Recebemos seu cadastro")).toBeVisible();

  const companyBefore = await getCompany();
  expect(companyBefore).not.toBeNull();

  // Segunda passada com o mesmo e-mail: o app avisa que já está em análise.
  const second = await submitFullLead(page);
  await expect(second.getByText("Já recebemos seu cadastro")).toBeVisible();

  const companyAfter = await getCompany();
  expect(companyAfter!.id, "a company não deveria ter sido recriada").toBe(companyBefore!.id);
});
