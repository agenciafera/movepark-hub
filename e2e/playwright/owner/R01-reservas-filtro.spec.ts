/**
 * O-13 do roteiro do operador: filtro por status e busca por código em
 * `/operator/bookings`.
 *
 * SÓ LEITURA: não cria, não altera e não apaga nada. Por isso o nome tem o prefixo
 * `R`, que é o que joga o spec no project `e2e-owner` (suíte padrão, sem a trava tx).
 * Ver a convenção no `playwright.config.ts`.
 *
 * O que se prova, além de "a tela abre": o filtro REALMENTE filtra. Assertar só que
 * existe uma linha com o status escolhido passaria mesmo com o filtro quebrado, já que
 * a lista sem filtro traz todos os status. Por isso cada caso confere os dois lados:
 * o status pedido aparece E o outro status some da tela.
 *
 * A cobertura do filtro "Expirada" veio junto do O-02 (no spec da jornada). Aqui ela
 * ganha o par negativo, e entram a "Concluída" e a busca por código.
 */
import { test, expect } from "@playwright/test";
import { findFeraBookingCode } from "../support/owner";

/** Seleciona um status no combo da tela e espera o filtro pegar. */
async function filtrarPor(page: import("@playwright/test").Page, label: string) {
  await page.locator("#booking-status").click();
  await page.getByRole("option", { name: label }).click();
  await expect(page.locator("#booking-status")).toContainText(label);
}

test.describe("Roteiro O: filtro e busca de reservas (Agência Fera)", () => {
  test("O-13: o filtro por status mostra só o status escolhido", async ({ page }) => {
    await page.goto("/operator/bookings");
    // `exact` evita casar com título de estado vazio que contenha a mesma palavra
    // (strict mode). Timeout largo porque a tela só monta depois que a sessão resolve.
    await expect(page.getByRole("heading", { name: "Reservas", exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // Concluída: aparece concluída, e não sobra nenhuma expirada na tela.
    await filtrarPor(page, "Concluída");
    await expect(page.getByRole("row").filter({ hasText: "Concluída" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("row").filter({ hasText: "Expirada" })).toHaveCount(0);

    // Expirada: o inverso, com o mesmo rigor.
    await filtrarPor(page, "Expirada");
    await expect(page.getByRole("row").filter({ hasText: "Expirada" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("row").filter({ hasText: "Concluída" })).toHaveCount(0);
  });

  test("O-13: a busca por código isola a reserva", async ({ page }) => {
    const code = await findFeraBookingCode("completed");
    test.skip(!code, "Agência Fera sem reserva concluída para servir de alvo da busca.");

    await page.goto("/operator/bookings");
    await expect(page.getByRole("heading", { name: "Reservas" })).toBeVisible({ timeout: 30_000 });
    await page.locator("#search").fill(code!);

    // Sobra a linha do cabeçalho e a da reserva buscada: prova que as outras sumiram.
    await expect(page.getByRole("row")).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByRole("row").filter({ hasText: code! })).toBeVisible();
  });
});
