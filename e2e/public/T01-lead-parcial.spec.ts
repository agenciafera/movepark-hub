/**
 * T-01 do roteiro E1.3: captura progressiva (abandono).
 *
 * O passo 1 do modal "Seja parceiro" grava um lead parcial e não dispara
 * e-mail. O caso para de propósito no passo 2, sem concluir, porque o que se
 * testa é justamente o abandono.
 *
 * Este spec ESCREVE no banco de produção, dentro do escopo da fixture Mercy.
 * A limpeza roda antes e depois, e passa pelas guardas de `support/db.ts`.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, getLead, getAppSetting } from "../support/db";
import { openLeadModal, fillStep1 } from "../support/leadFlow";
import { FIXTURE_EMAIL } from "../support/fixtures";

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

  const modal = await openLeadModal(page);
  await fillStep1(modal);

  // Estado no banco: lead parcial registrado.
  const lead = await getLead();
  expect(lead, "o passo 1 deveria ter gravado o lead").not.toBeNull();
  expect(lead!.status).toBe("partial");
  expect(lead!.step).toBeGreaterThanOrEqual(1);
  expect(lead!.contact_email).toBe(FIXTURE_EMAIL);

  // E nenhum e-mail: o marcador de envio não pode ter mudado.
  expect(await getAppSetting("partner_email_last_result")).toEqual(emailResultBefore);
});
