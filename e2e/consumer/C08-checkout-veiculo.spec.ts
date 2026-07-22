/**
 * C-08 do roteiro do consumidor: passo 2 do checkout (veículo).
 *
 * ESCREVE EM PRODUÇÃO: cria uma reserva para chegar ao passo 2. Sem cobrança.
 * Só roda no project `e2e-consumer-tx`.
 *
 * Armadilha do roteiro: o cliente de teste acumula veículos a cada execução.
 * Antes de reportar "veículo duplicado", confira se não é resíduo de rodada
 * anterior. Este spec NÃO cadastra veículo novo de propósito: ele escolhe um dos
 * que já existem na conta, então não engorda a lista.
 */
import { test, expect } from "@playwright/test";
import { guardTx } from "../support/consumer";
import {
  fillIdentityStep,
  fillVehicleStep,
  getBookingByCode,
  reserveCheapest,
} from "../support/consumer";


guardTx(test);

test.describe.serial("C-08", () => {
  test("C-08: passo 2 vincula o veículo escolhido à reserva", async ({ page }) => {
    const code = await reserveCheapest(page, 4);
    await fillIdentityStep(page);

    await expect(page.getByRole("heading", { name: "Veículo" })).toBeVisible({ timeout: 30_000 });
    await fillVehicleStep(page);

    // Avançou pro passo 3.
    await expect(page.getByRole("heading", { name: "Pagamento" })).toBeVisible({ timeout: 30_000 });

    const booking = await getBookingByCode(code);
    expect(booking).not.toBeNull();
    expect(booking!.vehicle_id, "o veículo escolhido deveria estar na reserva").not.toBeNull();
  });
});
