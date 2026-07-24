/**
 * Roteiro O: jornada do DONO de estacionamento.
 *
 * Dono = peu+operador@fera.ag, owner da company Abbapark (unidade Aeroporto
 * Afonso Pena). O roteiro cobre a visão dele ponta a ponta:
 *   O-01  conferir as reservas da empresa;
 *   O-02  ver as reservas canceladas   → FURO CONHECIDO (test.fail);
 *   O-03  mudar a diária de um tipo de vaga, e provar que o valor novo propaga
 *         pro motor de preço (a RPC que a busca usa), pro checkout do consumidor
 *         (breakdown da reserva) e de volta pro painel do dono.
 *
 * ESCREVE EM PRODUÇÃO (sandbox): o O-03 altera o preço real do Abbapark e cria
 * um `booking` de verdade (pendente, expira sozinho). O preço é REVERTIDO no
 * afterAll. Por isso o spec só roda por nome, atrás da trava tx:
 *
 *     bunx playwright test --project=e2e-owner-tx
 *
 * Limpeza: a reserva pendente expira sozinha; nunca `delete` em `booking`. O
 * preço volta ao snapshot no afterAll.
 */
import { test, expect } from "@playwright/test";
import { guardTx, reserveUntilPayment, ABBAPARK } from "../support/consumer";
import {
  ABBAPARK_OWNER,
  resolveUncoveredRuleId,
  snapshotTiers,
  restoreTiers,
  simulateConsumerPrice,
  bookingParkingPrice,
  type TierRow,
} from "../support/owner";
import { CUSTOMER_STATE } from "../support/session";

guardTx(test);

/** Marcador de teste, claramente artificial e abaixo das faixas seguintes
 * (16,90 → 12,34 não inverte a curva, então salva sem aviso). */
const NEW_DAILY = 12.34;
/** Offset de dias da reserva. Longe dos offsets dos specs C (1..~21) e de
 * qualquer antecedência mínima, para não colidir na dedup nem na capacidade. */
const BOOKING_OFFSET_DAYS = 45;

test.describe("Roteiro O: jornada do dono (Abbapark)", () => {
  let ruleId = "";
  let original: TierRow[] = [];

  test.beforeAll(async () => {
    ruleId = await resolveUncoveredRuleId();
    original = await snapshotTiers(ruleId);
    expect(original.length, "a Vaga Descoberta precisa ter faixas de preço").toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    // Devolve a diária ao que era, para não deixar o Abbapark alterado.
    if (ruleId && original.length) await restoreTiers(ruleId, original);
  });

  test("O-01: a lista de reservas da empresa carrega", async ({ page }) => {
    await page.goto("/operator/bookings");
    await expect(page.getByRole("heading", { name: "Reservas" })).toBeVisible();
    // A empresa tem reservas concluídas; a tabela renderiza com a coluna Status.
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  });

  test("O-02: o dono consegue ver as reservas canceladas", async ({ page }) => {
    // FURO CONHECIDO: cancelar uma reserva faz soft-delete (status='cancelled' E
    // deleted_at=now(), em 3 migrations), e a lista do painel filtra
    // `deleted_at is null`. Então o filtro "Cancelada" fica sempre vazio, mesmo
    // havendo canceladas no banco (o Abbapark tem 18). Ver furos-visao-dono.md.
    // Quando o furo for fechado, este teste passa e o test.fail vira vermelho:
    // aí é só remover a marcação.
    test.fail(true, "Cancelamento faz soft-delete; o filtro Cancelada nunca lista nada");

    await page.goto("/operator/bookings");
    await page.locator("#booking-status").click();
    await page.getByRole("option", { name: "Cancelada" }).click();
    // Confirma que o filtro foi aplicado (evita falso-positivo de timing).
    await expect(page.locator("#booking-status")).toContainText("Cancelada");

    // Intenção: com o filtro em Cancelada, pelo menos uma reserva cancelada
    // aparece. Hoje nenhuma aparece (a lista assenta em "Nenhuma reserva
    // encontrada"), então esta espera estoura e o test.fail a captura.
    await expect(
      page.getByRole("row").filter({ hasText: "Cancelada" }).first(),
    ).toBeVisible({ timeout: 6_000 });
  });

  test("O-03: mudar o preço propaga para a busca, o checkout e o painel", async ({
    page,
    browser,
  }) => {
    // 1) O dono muda a diária da Vaga Descoberta na tela de Preços.
    await page.goto("/operator/pricing");
    const card = page
      .locator("div.rounded-md.border-hairline")
      .filter({ hasText: ABBAPARK_OWNER.parkingTypeName });
    await card.getByRole("button", { name: "Editar preços" }).click();
    await expect(
      page.getByText(`Precificação: ${ABBAPARK_OWNER.parkingTypeName}`),
    ).toBeVisible();

    const firstTierPrice = page.getByLabel("Preço por dia").first();
    await firstTierPrice.fill(NEW_DAILY.toFixed(2).replace(".", ","));
    await page.getByRole("button", { name: "Salvar precificação" }).click();
    await expect(page.getByText("Precificação salva")).toBeVisible();

    // 2) O motor de preço (a mesma RPC que a busca e o detalhe usam) já devolve o
    //    valor novo para 1 diária.
    await expect
      .poll(async () => (await simulateConsumerPrice(1)).price, { timeout: 15_000 })
      .toBe(NEW_DAILY);

    // 3) O consumidor reserva 1 diária e o preço novo entra no snapshot da reserva
    //    (prova que a vitrine/checkout usou o valor novo). Sem cobrança: para no
    //    passo de pagamento.
    const customerContext = await browser.newContext({ storageState: CUSTOMER_STATE });
    const customerPage = await customerContext.newPage();
    try {
      const code = await reserveUntilPayment(customerPage, BOOKING_OFFSET_DAYS, {
        fixture: ABBAPARK,
        typeCode: ABBAPARK_OWNER.parkingTypeCode,
      });

      const snap = await bookingParkingPrice(code);
      expect(snap.parking_unit_price, "diária snapshotada na reserva").toBe(NEW_DAILY);
      expect(snap.parking_subtotal, "subtotal de parking de 1 diária").toBe(NEW_DAILY);

      // 4) Reflexo no painel do dono: a reserva nova aparece na lista dele.
      await page.goto(`/operator/bookings?q=${code}`);
      await expect(page.getByText(code)).toBeVisible({ timeout: 15_000 });
    } finally {
      await customerContext.close();
    }
  });
});
