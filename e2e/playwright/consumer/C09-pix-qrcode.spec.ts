/**
 * C-09 do roteiro do consumidor: passo 3 gera o QR do PIX.
 *
 * ATENÇÃO: ESTE SPEC CRIA COBRANÇA REAL NO PAGAR.ME.
 *
 * Na conta atual o PIX liquida sozinho em 1 a 3 segundos, então a cobrança
 * gerada aqui É PAGA, não fica pendurada. Por isso a unidade é a mais barata e o
 * período é de 1 diária. Só roda no project `e2e-consumer-tx`:
 *
 *     bunx playwright test --project=e2e-consumer-tx
 *
 * Armadilhas do roteiro cobertas aqui:
 *   - o aceite dos Termos é server-authoritative (`create-pix-charge:88-94`):
 *     sem ele a Edge devolve 422 mesmo que a UI pareça ter deixado passar. O
 *     passo 1 do helper marca o aceite;
 *   - gerar o PIX RENOVA o hold da reserva (`:232-237`). O tempo restante
 *     anotado no C-06 deixa de valer;
 *   - a Tarifa fica FORA do split com o parceiro. Ao conferir valores, compare o
 *     split contra o total menos a tarifa;
 *   - o `mock-payment` ainda existe no repo mas está órfão. Nenhum caminho de
 *     produção passa por ele.
 */
import { test, expect } from "@playwright/test";
import { guardTx } from "../support/consumer";
import {
  getBookingByCode,
  getPaymentByBookingId,
  reserveUntilPayment,
} from "../support/consumer";


guardTx(test);

test.describe.serial("C-09", () => {
  test("C-09: gerar PIX mostra o QR e cria o pagamento no banco", async ({ page }) => {
    const code = await reserveUntilPayment(page, 5);

    // O CPF/CNPJ do pagador vem pré-preenchido do perfil. Vazio aqui significa
    // que o cliente de teste perdeu o `tax_id`, e o PIX vai falhar com erro que
    // parece de pagamento sem ser.
    const taxId = page.locator("#pay-tax-id");
    await expect(taxId).not.toHaveValue("");

    await page.getByRole("button", { name: "Gerar PIX" }).click();

    await expect(page.getByRole("button", { name: "Copiar código PIX" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("Aguardando confirmação automática")).toBeVisible();

    const booking = await getBookingByCode(code);
    expect(booking).not.toBeNull();

    const payment = await getPaymentByBookingId(booking!.id);
    expect(payment, "a cobrança deveria existir no banco").not.toBeNull();
    expect(payment!.provider).toBe("pagarme");
    expect(payment!.method).toBe("pix");
    expect(Number(payment!.amount)).toBeGreaterThan(0);
  });
});
