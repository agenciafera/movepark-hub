/**
 * C-16 do roteiro do consumidor: upgrade de Tarifa, da Básica para a Superflex.
 *
 * ATENÇÃO: CRIA DUAS COBRANÇAS REAIS NO PAGAR.ME. A primeira paga a reserva; a
 * segunda paga o delta do upgrade (R$ 24,90), separada da reserva. Só roda no
 * project `e2e-consumer-tx`:
 *
 *     bunx playwright test --project=e2e-consumer-tx
 *
 * O que o caso prova, em ordem de importância:
 *   1. `fare_tier` vira `superflex` e `fare_price_cents` vira 2490;
 *   2. `total_amount` soma o delta;
 *   3. `fare_cancel_until` é RECALCULADO para 1 minuto antes do check-in.
 *
 * O item 3 é o que justifica o caso existir. A janela é um snapshot congelado na
 * criação da reserva, e o upgrade é um dos dois pontos que a recalculam
 * (`20260720000000_fare_upgrade.sql:38-46`). Um recálculo esquecido aqui deixaria
 * o cliente pagando por uma janela que o gate não enxerga.
 *
 * Armadilhas do roteiro cobertas aqui:
 *   - pular etapas é permitido: Básica direto para Superflex funciona, sem
 *     passar pela Flex;
 *   - o upgrade é SÓ PIX (`create-fare-upgrade:142`). A ausência de cartão não é
 *     defeito;
 *   - o split do upgrade é 100% Movepark. Esse valor não aparece no extrato da
 *     unidade;
 *   - o webhook trata o upgrade num ramo que RETORNA CEDO: não confirma reserva
 *     e não gera voucher. Voucher que não se atualiza depois do upgrade é o
 *     comportamento atual do código, não regressão deste teste.
 *
 * Limpeza: cancelar pela conta do cliente. O estorno cobre a reserva; o delta do
 * upgrade é cobrança separada e não volta pelo mesmo caminho.
 */
import { test, expect } from "@playwright/test";
import { guardTx } from "../support/consumer";
import { bookAndPay, getBookingFareByCode, oneNightRange } from "../support/consumer";

/** Preço da Superflex no catálogo (`20260717000000_fare_tiers.sql:46-70`). */
const SUPERFLEX_PRICE_CENTS = 2490;
/** Janela da Superflex: 1 minuto antes do check-in. */
const SUPERFLEX_WINDOW_MINUTES = 1;


guardTx(test);

test.describe.serial("C-16", () => {
  test("C-16: upgrade para Superflex cobra o delta e recalcula a janela", async ({ page }) => {
    const code = await bookAndPay(page, { fare: "Básica", range: oneNightRange(9) });

    const before = await getBookingFareByCode(code);
    expect(before).not.toBeNull();
    expect(before!.fare_tier, "a reserva precisa nascer na Básica").toBe("basica");
    expect(before!.fare_price_cents).toBe(0);

    await page.goto(`/bookings/${code}`);
    await page.getByTestId("fare-upgrade-trigger").click();

    // O dialog já pré-seleciona o nível mais alto; o clique deixa a escolha
    // explícita no rastro do teste em vez de depender desse default.
    await page.getByTestId("fare-upgrade-option-superflex").click();
    await page.getByTestId("fare-upgrade-submit").click();

    await expect(page.getByTestId("fare-upgrade-qr")).toBeVisible({ timeout: 45_000 });

    // Quem aplica o upgrade é o webhook, depois da liquidação do PIX do delta.
    await expect
      .poll(async () => (await getBookingFareByCode(code))?.fare_tier ?? null, {
        timeout: 90_000,
        message:
          "a Tarifa não subiu depois do PIX do delta: comece pelo `get_logs` do pagarme-webhook, " +
          "que é quem aplica o upgrade.",
      })
      .toBe("superflex");

    const after = await getBookingFareByCode(code);
    expect(after!.fare_price_cents).toBe(SUPERFLEX_PRICE_CENTS);

    // O total soma o delta entre a Tarifa antiga e a nova.
    const deltaReais = (SUPERFLEX_PRICE_CENTS - before!.fare_price_cents) / 100;
    expect(Number(after!.total_amount)).toBeCloseTo(Number(before!.total_amount) + deltaReais, 2);

    // O ponto do caso: a janela foi recalculada, não herdada das 24h da Básica.
    expect(after!.fare_cancel_until, "sem janela não há o que provar").not.toBeNull();
    const expected =
      new Date(after!.check_in_at).getTime() - SUPERFLEX_WINDOW_MINUTES * 60_000;
    expect(new Date(after!.fare_cancel_until!).getTime()).toBe(expected);

    // E o check-in não se moveu: o upgrade mexe na janela, não nas datas.
    expect(after!.check_in_at).toBe(before!.check_in_at);
  });
});
