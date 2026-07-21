/**
 * C-19 do roteiro do consumidor: cancelar dentro da janela devolve 100%.
 *
 * ATENÇÃO: CRIA COBRANÇA REAL e depois ESTORNA DE VERDADE no Pagar.me. Só roda
 * no project `e2e-consumer-tx`:
 *
 *     bunx playwright test --project=e2e-consumer-tx
 *
 * Este spec é também a limpeza do próprio roteiro: ele fecha a reserva que criou
 * pelo caminho de produção, que é a política da suíte (cancelar, nunca apagar).
 *
 * ARMADILHA MAIS PROVÁVEL DO ROTEIRO INTEIRO, e é por isso que o teste NÃO
 * asserta `payment.status = 'refunded'`:
 *
 *   Logo após o cancelamento, o estado normal e CORRETO é `status = 'paid'` com
 *   `refunded_at` preenchido. É o `refundPending` do `cancel-booking:175`: o PIX
 *   fecha o estorno de forma assíncrona, e quem escreve `refunded` depois é o
 *   webhook `charge.refunded` ou a `reconcile-refunds`. Assertar `refunded` aqui
 *   faria o teste falhar por um motivo que não é defeito nenhum.
 *
 *   Não confunda com o C-12, que é o defeito de verdade. A diferença: no C-12 o
 *   problema é `paid_at` preenchido com status `pending`; aqui é `refunded_at`
 *   preenchido com status `paid`, e isso está certo. O fechamento final é do
 *   C-22, conferido por consulta depois, não por espera dentro do E2E.
 *
 * Outras armadilhas cobertas:
 *   - a ordem importa: se o estorno falha no gateway, a Edge ABORTA sem tocar na
 *     reserva (`:167-171`). Reserva ativa depois de erro de cancelamento é a
 *     regra "nunca cancelar sem estornar", não bug;
 *   - o cancelamento grava `deleted_at`. A reserva some das listagens que filtram
 *     soft delete e aparece na aba "Canceladas" de `/bookings`.
 */
import { test, expect } from "@playwright/test";
import {
  bookAndPay,
  getBookingFareByCode,
  getPaymentByBookingId,
  rangeStartingIn,
} from "../support/consumer";

/** Check-in daqui a 48h: bem dentro da janela de 24h da Básica, sem depender da hora do dia. */
const CHECK_IN_IN_MINUTES = 48 * 60;

test.describe.serial("C-19", () => {
  test("C-19: cancelar dentro da janela cancela a reserva e dispara o estorno", async ({ page }) => {
    const code = await bookAndPay(page, {
      fare: "Básica",
      range: rangeStartingIn(CHECK_IN_IN_MINUTES),
    });

    const booking = await getBookingFareByCode(code);
    expect(booking!.status).toBe("confirmed");
    // A janela é snapshot da criação. Confirmar que ela está no futuro é o
    // pré-requisito do caso, não detalhe: sem isso o teste provaria o C-20.
    expect(booking!.fare_cancel_until).not.toBeNull();
    expect(new Date(booking!.fare_cancel_until!).getTime()).toBeGreaterThan(Date.now());

    await page.goto(`/bookings/${code}`);
    await page.getByTestId("cancel-booking-trigger").click();
    await page.getByTestId("cancel-booking-confirm").click();

    // O sucesso navega de volta para a lista.
    await page.waitForURL(/\/bookings\/?(\?.*)?$/, { timeout: 45_000 });

    await expect
      .poll(async () => (await getBookingFareByCode(code))?.status ?? null, {
        timeout: 30_000,
        message: "a reserva deveria estar cancelada depois do estorno",
      })
      .toBe("cancelled");

    const cancelled = await getBookingFareByCode(code);
    const payment = await getPaymentByBookingId(cancelled!.id);
    expect(payment).not.toBeNull();
    expect(payment!.refunded_at, "o estorno tem que estar registrado no pagamento").not.toBeNull();

    // De propósito NÃO se asserta `payment.status`. Ver o cabeçalho: `paid` com
    // `refunded_at` preenchido é o estado correto neste instante.
    expect(["paid", "refunded"]).toContain(payment!.status);
  });
});
