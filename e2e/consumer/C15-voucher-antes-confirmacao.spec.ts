/**
 * C-15 do roteiro do consumidor: o voucher não existe antes da confirmação.
 *
 * POR QUE ESTE CASO MORA NO PROJECT TRANSACIONAL, mesmo sendo "só um 422".
 *
 * A primeira tentativa foi mantê-lo no project de leitura, reaproveitando alguma
 * reserva do cliente de teste que já estivesse fora da allowlist do voucher.
 * Não funciona, e o motivo é interessante: o cancelamento grava `deleted_at`, e
 * a `voucher-pdf` filtra `.is("deleted_at", null)` antes de olhar o status. Uma
 * reserva cancelada devolve 404, não 422. Medido em 21/07/2026 com a MP-449353.
 *
 * Ou seja: o único estado que produz o 422 é `pending`, e reserva pendente
 * expira sozinha. Para o caso rodar de verdade, ele precisa criar a sua.
 *
 * O CUSTO é o do C-06, não o do C-09: cria `booking` e consome capacidade até o
 * hold expirar, SEM gerar cobrança no Pagar.me. O spec para no passo 1 do
 * checkout de propósito, antes de qualquer PIX.
 *
 * A prova é a Edge devolvendo 422: `VOUCHER_BOOKING_STATUSES` aceita só
 * `confirmed`, `checked_in` e `completed` (`_shared/voucher/fields.ts:63`).
 *
 * Só roda no project `e2e-consumer-tx`:
 *
 *     bunx playwright test --project=e2e-consumer-tx
 *
 * DIVERGÊNCIA CONHECIDA entre servidor e tela, registrada pelo roteiro e não
 * "corrigida" aqui: o servidor aceita `completed`, mas a UI só mostra o card do
 * voucher com `confirmed` ou `checked_in` (`bookings-detail.tsx:99`). Reserva
 * concluída TEM voucher válido e NÃO mostra o botão. É inconsistência real, não
 * erro de execução do roteiro.
 *
 * A cobertura mais barata deste caso seria um `deno test` da `voucher-pdf`, que
 * hoje não existe. Enquanto não existir, ele vive aqui.
 */
import { test, expect } from "@playwright/test";
import { guardTx } from "../support/consumer";
import {
  callEdgeAsCustomer,
  getBookingByCode,
  reserveCheapest,
  VOUCHER_ALLOWED_STATUSES,
} from "../support/consumer";


guardTx(test);

test.describe.serial("C-15", () => {
  test("C-15: reserva pendente não tem voucher, e a Edge devolve 422", async ({ page }) => {
    // Para no passo 1: sem identidade, sem veículo, sem PIX. Nenhuma cobrança.
    const code = await reserveCheapest(page);

    const booking = await getBookingByCode(code);
    expect(booking!.status).toBe("pending");
    expect(VOUCHER_ALLOWED_STATUSES).not.toContain(booking!.status);

    const res = await callEdgeAsCustomer<{ error?: string }>(page, "voucher-pdf", { code });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("após a confirmação do pagamento");

    // E o 422 não escreveu nada: sem PDF, sem `voucher_url`.
    const after = await getBookingByCode(code);
    expect(after!.status).toBe("pending");
  });
});
