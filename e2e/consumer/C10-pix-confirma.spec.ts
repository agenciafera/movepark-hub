/**
 * C-10 do roteiro do consumidor: PIX pago confirma a reserva e avança pro passo 4.
 *
 * ATENÇÃO: ESTE SPEC LIQUIDA UMA COBRANÇA REAL e dispara e-mail de confirmação
 * para o cliente de teste. Só roda no project `e2e-consumer-tx`.
 *
 * Quem confirma NÃO é a `create-pix-charge`, é o webhook
 * (`pagarme-webhook/index.ts:369-372`). Se a reserva não confirmar, o suspeito é
 * a entrega do webhook, não a geração do QR: comece pelo `get_logs` da função.
 *
 * A confirmação passa por `confirm_or_refund_booking`. Se a capacidade acabou
 * entre a geração e o pagamento, a reserva é ESTORNADA em vez de confirmada
 * (`refunded_at` preenchido). Isso é comportamento correto, não falha, e o teste
 * distingue os dois casos na mensagem.
 *
 * A liquidação automática é característica da conta atual do gateway. Se um dia
 * ela virar produção com PIX pago por humano, este caso deixa de ser
 * automatizável e volta a ser manual.
 */
import { test, expect } from "@playwright/test";
import { guardTx } from "../support/consumer";
import {
  getBookingByCode,
  getPaymentByBookingId,
  reserveUntilPayment,
} from "../support/consumer";


guardTx(test);

test.describe.serial("C-10", () => {
  test("C-10: PIX liquidado confirma a reserva", async ({ page }) => {
    const code = await reserveUntilPayment(page);

    await page.getByRole("button", { name: "Gerar PIX" }).click();
    await expect(page.getByRole("button", { name: "Copiar código PIX" })).toBeVisible({
      timeout: 45_000,
    });

    // A tela avança sozinha pro passo 4 pelo polling de 2s (`checkout/api.ts:174-179`).
    await expect(page.getByRole("heading", { name: "Reserva confirmada!" })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText(code)).toBeVisible();

    const booking = await getBookingByCode(code);
    expect(booking).not.toBeNull();

    const payment = await getPaymentByBookingId(booking!.id);
    expect(payment).not.toBeNull();
    expect(
      payment!.refunded_at,
      "estorno em vez de confirmação significa que a capacidade acabou no meio do caminho, " +
        "o que é comportamento correto e não bug de pagamento",
    ).toBeNull();

    expect(payment!.status).toBe("paid");
    expect(payment!.paid_at).not.toBeNull();
    expect(booking!.status).toBe("confirmed");
  });
});
