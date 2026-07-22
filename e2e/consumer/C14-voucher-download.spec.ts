/**
 * C-14 do roteiro do consumidor: baixar o voucher em PDF.
 *
 * ATENÇÃO: CRIA COBRANÇA REAL NO PAGAR.ME. Precisa de uma reserva confirmada, e
 * a única forma honesta de ter uma é pagando. Só roda no project
 * `e2e-consumer-tx`:
 *
 *     bunx playwright test --project=e2e-consumer-tx
 *
 * Armadilhas do roteiro cobertas aqui:
 *   - o voucher JÁ EXISTE antes do clique. Quem gera é o webhook, no evento de
 *     pagamento (`pagarme-webhook:397-401`); o botão só assina uma URL. Por isso
 *     o teste confere `voucher_url` ANTES de clicar: se o PDF não existir, o
 *     suspeito é o webhook, não o botão;
 *   - a URL assinada vale 1 HORA (`voucher-pdf:96-98`). Link guardado de uma
 *     execução anterior dá erro de acesso, o que parece bug de permissão e não é;
 *   - o bucket `vouchers` é PRIVADO. A URL tem que ser assinada (`/object/sign/`
 *     com `token=`); a pública direta falhar é o comportamento correto;
 *   - o botão do passo 4 e o do detalhe usam o MESMO hook (`useVoucherPdf`), e o
 *     teste exercita os dois, que é o que o roteiro pede.
 *
 * Limpeza: cancelar pela conta do cliente. Nunca `delete` em `booking`.
 */
import { test, expect, type Page } from "@playwright/test";
import { guardTx } from "../support/consumer";
import {
  bookAndPay,
  oneNightRange,
  getBookingFareByCode,
  voucherFileExists,
} from "../support/consumer";


guardTx(test);

test.describe.serial("C-14", () => {
  test("C-14: o voucher já existe no webhook e o botão assina a URL", async ({ page }) => {
    const code = await bookAndPay(page, { fare: "Básica", range: oneNightRange(8) });

    // O webhook grava o `voucher_url` na confirmação, ANTES de qualquer clique.
    // A espera é pela entrega do webhook, não pelo botão.
    await expect
      .poll(async () => (await getBookingFareByCode(code))?.voucher_url ?? null, {
        timeout: 60_000,
        message:
          "`voucher_url` vazio depois da confirmação: quem gera o PDF é o webhook, " +
          "então o suspeito é a entrega dele, não o botão de baixar.",
      })
      .not.toBeNull();

    const booking = await getBookingFareByCode(code);
    expect(booking!.voucher_url).toBe(`${booking!.id}.pdf`);
    expect(
      await voucherFileExists(booking!.id),
      "o arquivo deveria existir no bucket privado `vouchers`",
    ).toBe(true);

    // Passo 4 do checkout: o botão pede a URL à Edge e abre em outra aba.
    const step4Url = await clickAndCaptureVoucherUrl(page, "voucher-download-pdf-step4");
    expectSignedVoucherUrl(step4Url, booking!.id);

    // Mesmo hook, outra tela: o card do voucher no detalhe da reserva.
    await page.goto(`/bookings/${code}`);
    await expect(page.getByRole("heading", { name: "Voucher" })).toBeVisible({ timeout: 30_000 });

    const detailUrl = await clickAndCaptureVoucherUrl(page, "voucher-download-pdf");
    expectSignedVoucherUrl(detailUrl, booking!.id);

    // A URL assinada tem que servir o PDF de verdade, não só existir.
    const res = await page.request.get(detailUrl);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
  });
});

/**
 * Clica no botão de baixar e devolve a URL que a Edge `voucher-pdf` assinou.
 *
 * Por que ler da resposta da Edge e não da aba aberta: o botão faz
 * `window.open(url)` DEPOIS de resolver a URL, mas essa URL serve um PDF, e o
 * Chromium trata isso como DOWNLOAD, não como navegação. A aba abre e fica em
 * `":"` para sempre, então `popup.url()` e `popup.waitForURL()` não servem aqui.
 * Custou duas execuções para descobrir (21 e 22/07), as duas acusando o produto
 * de um problema que era do spec.
 *
 * A resposta da Edge é a fonte certa: é exatamente o que o app usa para abrir.
 */
async function clickAndCaptureVoucherUrl(page: Page, testId: string): Promise<string> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/functions/v1/voucher-pdf") && r.request().method() === "POST",
      { timeout: 30_000 },
    ),
    page.getByTestId(testId).click(),
  ]);
  expect(response.status(), "a Edge voucher-pdf deveria responder 200").toBe(200);
  const body = (await response.json()) as { url?: string };
  expect(body.url, "a Edge deveria devolver a URL assinada").toBeTruthy();
  return body.url!;
}

/**
 * A URL do voucher tem que ser ASSINADA. Se um dia ela vier como `/object/public/`,
 * o bucket deixou de ser privado, e isso é vazamento, não conveniência.
 */
function expectSignedVoucherUrl(url: string, bookingId: string) {
  expect(url).toContain(`/storage/v1/object/sign/vouchers/${bookingId}.pdf`);
  expect(url, "a URL do voucher tem que ser assinada, com token").toContain("token=");
}
