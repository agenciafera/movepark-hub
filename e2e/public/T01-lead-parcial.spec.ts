/**
 * T-01 do roteiro E1.3: captura progressiva (abandono).
 *
 * O passo 1 do modal "Seja parceiro" grava um lead parcial e não dispara
 * e-mail. O caso termina de propósito no passo 2, sem concluir, porque o que
 * se testa é justamente o abandono.
 *
 * Este spec ESCREVE no banco de produção, dentro do escopo da fixture Mercy.
 * A limpeza roda antes e depois, e passa pelas guardas de `support/db.ts`.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, getLead, getAppSetting } from "../support/db";
import { FIXTURE_EMAIL, FIXTURE_COMPANY_NAME } from "../support/fixtures";

const PHONE_DIGITS = "11987727182";

test.beforeEach(async () => {
  await cleanupFixture();
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-01: passo 1 grava lead parcial e não dispara e-mail", async ({ page }) => {
  // Pré-condição do roteiro: nenhum lead com o e-mail da fixture.
  expect(await getLead()).toBeNull();

  // O e-mail do T-03 roda em background e grava aqui. Guardamos o valor antes
  // para provar, no fim, que o passo 1 sozinho não disparou nada.
  const emailResultBefore = await getAppSetting("partner_email_last_result");

  await page.goto("/seja-parceiro");
  await page.getByRole("button", { name: "Quero ser parceiro" }).first().click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Passo 1 de 2")).toBeVisible();

  await modal.locator("#pl-name").fill(`Teste ${FIXTURE_COMPANY_NAME}`);
  await modal.locator("#pl-email").fill(FIXTURE_EMAIL);
  await modal.locator("#pl-phone").fill(PHONE_DIGITS);

  await modal.getByRole("button", { name: "Continuar" }).click();

  // Avançar para o passo 2 é o sinal de que o lead parcial foi aceito.
  await expect(modal.getByText("Passo 2 de 2")).toBeVisible();

  // Estado no banco: lead parcial registrado.
  const lead = await getLead();
  expect(lead, "o passo 1 deveria ter gravado o lead").not.toBeNull();
  expect(lead!.status).toBe("partial");
  expect(lead!.step).toBeGreaterThanOrEqual(1);
  expect(lead!.contact_email).toBe(FIXTURE_EMAIL);

  // E nenhum e-mail: o marcador de envio não pode ter mudado.
  expect(await getAppSetting("partner_email_last_result")).toEqual(emailResultBefore);
});
