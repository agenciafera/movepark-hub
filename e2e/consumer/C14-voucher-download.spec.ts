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
  getBookingFareByCode,
  voucherFileExists,
} from "../support/consumer";


guardTx(test);

test.describe.serial("C-14", () => {
  test("C-14: o voucher já existe no webhook e o botão assina a URL", async ({ page }) => {
    const code = await bookAndPay(page, { fare: "Básica" });

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

    // Passo 4 do checkout: o botão abre o PDF em outra aba (`window.open`).
    const [step4Popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByTestId("voucher-download-pdf-step4").click(),
    ]);
    await expectSignedVoucherUrl(step4Popup, booking!.id);
    await step4Popup.close();

    // Mesmo hook, outra tela: o card do voucher no detalhe da reserva.
    await page.goto(`/bookings/${code}`);
    await expect(page.getByRole("heading", { name: "Voucher" })).toBeVisible({ timeout: 30_000 });

    const [detailPopup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByTestId("voucher-download-pdf").click(),
    ]);
    await expectSignedVoucherUrl(detailPopup, booking!.id);

    // A URL assinada tem que servir o PDF de verdade, não só existir.
    const res = await page.request.get(detailPopup.url());
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    await detailPopup.close();
  });
});

/**
 * A URL do voucher tem que ser ASSINADA. Se um dia ela vier como `/object/public/`,
 * o bucket deixou de ser privado, e isso é vazamento, não conveniência.
 *
 * Espera o popup navegar antes de ler a URL. O botão faz `window.open` e SÓ DEPOIS
 * troca a URL, quando a Edge devolve a assinatura. Lendo `popup.url()` na hora, vem
 * `":"` (a aba ainda em branco) e o teste falha por corrida própria, acusando o
 * produto de um defeito que é do spec. Aconteceu na primeira execução, em 21/07/2026.
 */
async function expectSignedVoucherUrl(popup: Page, bookingId: string) {
  const expected = `/storage/v1/object/sign/vouchers/${bookingId}.pdf`;
  await popup.waitForURL((url) => url.pathname.includes(expected), { timeout: 30_000 });
  expect(popup.url()).toContain(expected);
  expect(popup.url()).toContain("token=");
}
