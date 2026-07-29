/**
 * Smoke do harness, parte que não precisa de sessão.
 *
 * Prova que o dev server responde, que uma rota pública renderiza e que o
 * client service_role fala com o banco. Não depende do project `setup`, então
 * roda mesmo com o bypass de auth quebrado, o que ajuda a isolar falha.
 *
 * Somente leitura. Nenhum teste daqui escreve no banco.
 */
import { test, expect } from "@playwright/test";
import { assertFixtureScoped, getAppSetting } from "../support/db";
import { describeTarget } from "../support/env";

test("rota pública responde", async ({ page }) => {
  const response = await page.goto("/seja-parceiro");
  expect(response?.status(), `alvo: ${describeTarget()}`).toBeLessThan(400);
  await expect(page.locator("body")).toBeVisible();
});

test("service_role lê o banco e as guardas da fixture estão ativas", async () => {
  assertFixtureScoped();

  // Chave que o T-03 usa. Pode estar ausente no banco; o que este teste garante
  // é que a credencial funciona e a query não estoura. Por isso o await é
  // direto: com service_role inválida, getAppSetting lança e o teste cai.
  const value = await getAppSetting("partner_email_last_result");
  expect(value === null || ["string", "object"].includes(typeof value)).toBe(true);
});
