/**
 * C-20 do roteiro do consumidor: cancelar fora da janela é bloqueado.
 *
 * ATENÇÃO: CRIA COBRANÇA REAL NO PAGAR.ME. Só roda no project `e2e-consumer-tx`:
 *
 *     bunx playwright test --project=e2e-consumer-tx
 *
 * LIMPEZA, leia antes de rodar: esta reserva nasce fora da janela de propósito,
 * então o cliente NÃO consegue cancelá-la, que é exatamente o que o caso prova.
 * Ela fica de pé até o check-in passar. Se precisar fechá-la antes, é pela mão do
 * staff (`developer@fera.ag`), que cancela com estorno em qualquer horário. Não
 * apague por `delete`.
 *
 * AS DUAS PARTES SÃO OBRIGATÓRIAS, e a segunda é a que vale:
 *   1. o botão de cancelar não renderiza e a tela explica o porquê;
 *   2. a chamada DIRETA à Edge devolve 403 com `code: "cancel_window_closed"`.
 *
 * Só a tela não prova nada: ausência de botão pode ser CSS. A prova do gate é o
 * servidor recusando (`cancel-booking:133-142`).
 *
 * ARMADILHA DO SNAPSHOT: `fare_cancel_until` é congelado na criação. Mexer em
 * `booking.check_in_at` depois NÃO move a janela, e o teste passaria ou falharia
 * pelo motivo errado. Por isso a reserva já nasce com o check-in perto.
 *
 * Outras armadilhas do roteiro:
 *   - não existe "cancelar sem reembolso" para o cliente. Foi decisão de produto
 *     (`logic.ts:17`), não lacuna;
 *   - reserva `pending` (não paga) cancela em qualquer horário, sem estorno. Isso
 *     não quebra o gate: o gate vale para reserva PAGA, que é a testada aqui;
 *   - staff cancela em qualquer horário. Testar isto logado como admin não prova
 *     o gate do cliente.
 */
import { test, expect } from "@playwright/test";
import {
  bookAndPay,
  callEdgeAsCustomer,
  getBookingFareByCode,
  rangeStartingIn,
} from "../support/consumer";

/**
 * Check-in daqui a 6h: dentro das 24h da Básica, então a janela de cancelamento
 * já nasce fechada. Folga suficiente para não esbarrar na antecedência mínima da
 * unidade nem no bloqueio de data retroativa.
 */
const CHECK_IN_IN_MINUTES = 6 * 60;

test.describe.serial("C-20", () => {
  test("C-20: fora da janela, a tela esconde o botão e a Edge devolve 403", async ({ page }) => {
    const code = await bookAndPay(page, {
      fare: "Básica",
      range: rangeStartingIn(CHECK_IN_IN_MINUTES),
    });

    const booking = await getBookingFareByCode(code);
    expect(booking!.status).toBe("confirmed");
    // Pré-requisito do caso: a janela já tem que estar fechada na criação.
    expect(booking!.fare_cancel_until).not.toBeNull();
    expect(
      new Date(booking!.fare_cancel_until!).getTime(),
      "a reserva precisa nascer com a janela fechada, senão o caso vira o C-19",
    ).toBeLessThan(Date.now());

    // Parte 1: a tela.
    await page.goto(`/bookings/${code}`);
    await expect(page.getByTestId("cancel-window-closed")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("cancel-booking-trigger")).toHaveCount(0);

    // Parte 2: o gate de verdade, por fora da UI.
    const res = await callEdgeAsCustomer<{ code?: string; error?: string }>(
      page,
      "cancel-booking",
      { booking_code: code },
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("cancel_window_closed");

    // E nada foi escrito: a Edge aborta antes de cobrar ou estornar.
    const after = await getBookingFareByCode(code);
    expect(after!.status).toBe("confirmed");
  });
});
