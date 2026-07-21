/**
 * C-21 do roteiro do consumidor: Superflex cancela até 1 minuto antes.
 *
 * ATENÇÃO: CRIA COBRANÇAS REAIS e ESTORNA DE VERDADE no Pagar.me. São duas
 * reservas pagas (uma por caminho) e, no segundo caso, também o PIX do delta do
 * upgrade. Só roda no project `e2e-consumer-tx`:
 *
 *     bunx playwright test --project=e2e-consumer-tx
 *
 * VALIDAÇÃO PELA EDGE E PELO BANCO, NUNCA PELO CRONÔMETRO DA TELA. A janela é de
 * 1 minuto, curta demais para clique confiável em navegador. O que o teste faz é
 * conferir `fare_cancel_until` no banco e mandar o cancelamento pela Edge.
 *
 * OS DOIS CAMINHOS DE CHEGAR EM SUPERFLEX, que é o ponto do caso:
 *   - nascer Superflex: a janela veio da criação da reserva
 *     (`_create_booking_core`, snapshot congelado no `check_in_at`);
 *   - chegar por upgrade: a janela foi RECALCULADA no upgrade
 *     (`20260720000000_fare_upgrade.sql:38-46`).
 *
 * É justamente aqui que um recálculo esquecido apareceria, e por isso não basta
 * testar um dos dois.
 *
 * O QUE ESTE SPEC NÃO COBRE, de propósito: a Superflex FORA da janela, ou seja
 * faltando menos de 1 minuto para o check-in. Não dá para criar essa reserva (a
 * criação exige check-in no futuro, com a antecedência mínima da unidade) nem
 * para esperar por ela sem deixar o teste refém do relógio. A forma do gate já é
 * provada pelo C-20, que usa a mesma Edge e o mesmo `cancel_window_closed`; a
 * regra por tarifa é coberta em pgTAP e no unit de `cancellation.logic`.
 *
 * Armadilha do roteiro: `check_in_at` muito próximo do agora esbarra no bloqueio
 * de antecedência mínima da unidade. O spec lê `pricing_rule.advance_booking_minutes`
 * antes e se pula sozinho quando a folga não cabe, em vez de falhar por um motivo
 * que não tem nada a ver com cancelamento.
 */
import { test, expect } from "@playwright/test";
import {
  bookAndPay,
  callEdgeAsCustomer,
  CHEAPEST_TYPE_CODE,
  getAdvanceBookingMinutes,
  getBookingFareByCode,
  getPaymentByBookingId,
  listActiveParkingTypes,
  MOTION_PARK,
  rangeStartingIn,
} from "../support/consumer";

/** Janela da Superflex no catálogo: 1 minuto antes do check-in. */
const SUPERFLEX_WINDOW_MINUTES = 1;
const SUPERFLEX_PRICE_CENTS = 2490;

/**
 * Check-in daqui a 90 minutos. Perto o bastante para o caso fazer sentido (fora
 * das 24h padrão) e longe o bastante para o teste terminar com a janela ainda
 * aberta, sem correr contra o relógio.
 */
const CHECK_IN_IN_MINUTES = 90;

/** Falha cedo e explica, se a unidade exigir mais antecedência do que o caso usa. */
async function skipIfAdvanceBlocks() {
  const types = await listActiveParkingTypes(MOTION_PARK);
  const target = types.find((t) => t.code === CHEAPEST_TYPE_CODE);
  expect(target, `a fixture ${MOTION_PARK.operatorSlug} precisa do tipo ${CHEAPEST_TYPE_CODE}`)
    .toBeTruthy();
  const advance = await getAdvanceBookingMinutes(target!.id);
  test.skip(
    advance >= CHECK_IN_IN_MINUTES,
    `A unidade exige ${advance} min de antecedência, e o caso precisa reservar a ` +
      `${CHECK_IN_IN_MINUTES} min do check-in. Ajuste a fixture ou a regra de preço.`,
  );
}

/** `fare_cancel_until` tem que ser exatamente check_in − 1 min. */
function expectSuperflexWindow(checkInAt: string, fareCancelUntil: string | null) {
  expect(fareCancelUntil, "Superflex sem janela gravada").not.toBeNull();
  const expected = new Date(checkInAt).getTime() - SUPERFLEX_WINDOW_MINUTES * 60_000;
  expect(new Date(fareCancelUntil!).getTime()).toBe(expected);
  expect(
    new Date(fareCancelUntil!).getTime(),
    "a janela já fechou antes do teste chegar a cancelar: aumente CHECK_IN_IN_MINUTES",
  ).toBeGreaterThan(Date.now());
}

/** Cancela pela Edge (não pela tela) e confere reserva cancelada + estorno registrado. */
async function cancelBySuperflexWindow(
  page: import("@playwright/test").Page,
  code: string,
) {
  const res = await callEdgeAsCustomer<{ status?: string; refunded?: boolean; code?: string }>(
    page,
    "cancel-booking",
    { booking_code: code, reason: "e2e C-21" },
  );
  expect(
    res.status,
    `a Edge deveria aceitar o cancelamento dentro da janela da Superflex (body: ${JSON.stringify(res.body)})`,
  ).toBe(200);
  expect(res.body.status).toBe("cancelled");
  expect(res.body.refunded).toBe(true);

  const booking = await getBookingFareByCode(code);
  expect(booking!.status).toBe("cancelled");

  const payment = await getPaymentByBookingId(booking!.id);
  expect(payment!.refunded_at, "estorno tem que estar registrado").not.toBeNull();
  // `status` fica em `paid` até o webhook do estorno chegar. Ver C-19 e C-22.
}

test.describe.serial("C-21", () => {
  test("C-21a: reserva que NASCE Superflex cancela a 1 minuto do check-in", async ({ page }) => {
    await skipIfAdvanceBlocks();

    const code = await bookAndPay(page, {
      fare: "Superflex",
      range: rangeStartingIn(CHECK_IN_IN_MINUTES),
    });

    const booking = await getBookingFareByCode(code);
    expect(booking!.fare_tier).toBe("superflex");
    expect(booking!.fare_price_cents).toBe(SUPERFLEX_PRICE_CENTS);
    expectSuperflexWindow(booking!.check_in_at, booking!.fare_cancel_until);

    // A Básica já estaria fora da janela a 90 min do check-in. A Superflex não:
    // é a diferença que o cliente pagou para ter.
    expect(new Date(booking!.check_in_at).getTime() - Date.now()).toBeLessThan(
      24 * 60 * 60_000,
    );

    await cancelBySuperflexWindow(page, code);
  });

  test("C-21b: reserva que chega em Superflex por UPGRADE recalcula a janela", async ({ page }) => {
    await skipIfAdvanceBlocks();

    const code = await bookAndPay(page, {
      fare: "Básica",
      range: rangeStartingIn(CHECK_IN_IN_MINUTES),
    });

    const before = await getBookingFareByCode(code);
    expect(before!.fare_tier).toBe("basica");
    // Nasceu com as 24h da Básica, então a janela já está fechada a 90 min do
    // check-in. É esse estado que o upgrade tem que reabrir.
    expect(new Date(before!.fare_cancel_until!).getTime()).toBeLessThan(Date.now());

    await page.goto(`/bookings/${code}`);
    await page.getByTestId("fare-upgrade-trigger").click();
    await page.getByTestId("fare-upgrade-option-superflex").click();
    await page.getByTestId("fare-upgrade-submit").click();
    await expect(page.getByTestId("fare-upgrade-qr")).toBeVisible({ timeout: 45_000 });

    await expect
      .poll(async () => (await getBookingFareByCode(code))?.fare_tier ?? null, {
        timeout: 90_000,
        message: "a Tarifa não subiu: comece pelo `get_logs` do pagarme-webhook.",
      })
      .toBe("superflex");

    const after = await getBookingFareByCode(code);
    expectSuperflexWindow(after!.check_in_at, after!.fare_cancel_until);

    // O upgrade reabriu a janela que a Básica tinha fechado. Sem o recálculo,
    // este cancelamento seria recusado com 403.
    await cancelBySuperflexWindow(page, code);
  });
});
