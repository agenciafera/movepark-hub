/**
 * Roteiro O (operação de reservas): fecha as lacunas de regressão que o roteiro do
 * operador apontou (docs/testes/roteiro-operador.md, seção "Cobertura automatizada
 * e lacunas"):
 *   O-15  check-in por QR em /voucher/validate (confirmed -> checked_in);
 *   O-14  transição no drawer de /operator/bookings (confirmed -> no_show).
 *
 * ESCREVE EM PRODUÇÃO (sandbox): semeia uma reserva CONFIRMADA de teste no Abbapark
 * pelo `admin` (service_role, que passa pelo guard `booking_guard_status_transition`),
 * roda a ação do operador pela UI e confere o efeito no banco. A reserva de teste tem
 * código fixo (OTEST-*), é reutilizada a cada rodada (upsert por code) e aposentada no
 * afterEach (soft-delete); NUNCA faz delete de booking. Só roda por nome, atrás da
 * mesma trava do consumidor tx:
 *
 *     bunx playwright test --project=e2e-owner-tx
 *
 * Por que semear pelo admin e não reservar+pagar como o C-*: aqui o alvo é a AÇÃO do
 * operador, não a criação; semear direto evita uma cobrança e deixa o setup determinístico.
 */
import { test, expect } from "@playwright/test";
import { guardTx } from "../support/consumer";
import {
  resolveAbbaparkLocationId,
  upsertConfirmedTestBooking,
  getBookingStatusByCode,
  retireTestBooking,
} from "../support/owner";
import { findUserIdByEmail } from "../support/db";
import { env } from "../support/env";

guardTx(test);

const CHECKIN_CODE = "OTEST-CHECKIN";
const DRAWER_CODE = "OTEST-DRAWER";

/** Janela a partir de agora: check-in em `startMinutes`, saída 24h depois. */
function futureRange(startMinutes: number) {
  const inMs = Date.now() + startMinutes * 60_000;
  return {
    checkIn: new Date(inMs).toISOString(),
    checkOut: new Date(inMs + 24 * 60 * 60_000).toISOString(),
  };
}

test.describe("Roteiro O: operação de reservas (Abbapark)", () => {
  let locationId = "";
  let customerId = "";

  test.beforeAll(async () => {
    locationId = await resolveAbbaparkLocationId();
    customerId = await findUserIdByEmail(env.customerEmail);
  });

  test.afterEach(async () => {
    // Aposenta as reservas de teste (soft-delete); nunca delete de booking. O upsert
    // do próximo run reativa a mesma linha, então não acumula.
    await retireTestBooking(CHECKIN_CODE);
    await retireTestBooking(DRAWER_CODE);
  });

  test("O-15: check-in por QR confirma a entrada (confirmed -> checked_in)", async ({ page }) => {
    // check-in em 30min: dentro da janela -30min/+2h, tom "success".
    const { checkIn, checkOut } = futureRange(30);
    await upsertConfirmedTestBooking({
      code: CHECKIN_CODE,
      locationId,
      profileId: customerId,
      checkInAt: checkIn,
      checkOutAt: checkOut,
    });

    await page.goto(`/voucher/validate?code=${CHECKIN_CODE}`);

    // Só `confirmed` libera o check-in; o botão aparece porque a reserva está confirmada.
    const registrar = page.getByRole("button", { name: "Registrar entrada" });
    await expect(registrar).toBeVisible({ timeout: 15_000 });
    await registrar.click();

    await expect
      .poll(async () => getBookingStatusByCode(CHECKIN_CODE), {
        timeout: 15_000,
        message: "o check-in deveria marcar a reserva como checked_in",
      })
      .toBe("checked_in");
  });

  test("O-14: o drawer transita a reserva (confirmed -> no_show)", async ({ page }) => {
    const { checkIn, checkOut } = futureRange(30);
    await upsertConfirmedTestBooking({
      code: DRAWER_CODE,
      locationId,
      profileId: customerId,
      checkInAt: checkIn,
      checkOutAt: checkOut,
    });

    await page.goto(`/operator/bookings?q=${DRAWER_CODE}`);

    // A linha da reserva de teste abre o detalhe (drawer).
    const row = page.getByRole("row").filter({ hasText: DRAWER_CODE });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();

    // O drawer abre com o título da reserva e as ações da transição.
    await expect(page.getByRole("heading", { name: `Reserva ${DRAWER_CODE}` })).toBeVisible();
    await page.getByRole("button", { name: "Não compareceu" }).click();

    await expect
      .poll(async () => getBookingStatusByCode(DRAWER_CODE), {
        timeout: 15_000,
        message: "a transição do drawer deveria marcar a reserva como no_show",
      })
      .toBe("no_show");
  });
});
