/**
 * T-03 do roteiro E1.3: e-mail de "novo lead" para o inbox interno.
 *
 * ATENÇÃO: como a suíte roda contra produção, este caso DISPARA E-MAIL DE
 * VERDADE a cada rodada, um para o lead e outro para hub@movepark.co. Se isso
 * incomodar, rode a suíte sem este spec.
 *
 * O envio acontece em background (`waitUntil` na Edge), então o resultado não
 * chega junto com a resposta HTTP. Por isso a asserção usa polling em vez de
 * uma leitura única.
 *
 * A caixa de entrada em si não é verificada aqui: o que dá para automatizar é
 * o marcador que a Edge grava em `app_setting`.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, getAppSetting } from "../support/db";
import { submitFullLead } from "../support/leadFlow";

const EMAIL_RESULT_KEY = "partner_email_last_result";

test.beforeEach(async () => {
  await cleanupFixture();
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-03: a submissão registra o resultado do envio de e-mail", async ({ page }) => {
  const before = await getAppSetting(EMAIL_RESULT_KEY);

  const modal = await submitFullLead(page);
  await expect(modal.getByText("Recebemos seu cadastro")).toBeVisible();

  // O envio é background, então o marcador demora a mudar.
  await expect
    .poll(() => getAppSetting(EMAIL_RESULT_KEY), {
      timeout: 30_000,
      intervals: [1000, 2000, 3000],
      message: "a Edge não registrou o resultado do envio em app_setting",
    })
    .not.toEqual(before);

  const after = JSON.stringify(await getAppSetting(EMAIL_RESULT_KEY));
  expect(after, "o alerta interno deveria ter saído sem erro").toContain("ok");
});
