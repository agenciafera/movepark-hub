/**
 * Smoke do bypass de auth. Prova que os storageStates gerados pelo project
 * `setup` caem logados nas áreas protegidas, sem passar pela tela de login.
 *
 * Este é o critério de aceite central da atividade 86ajmbgh5. Os casos de
 * regra de negócio (T-01 a T-16) moram na atividade 86ajkdr1d.
 *
 * Somente leitura. Nenhum teste daqui escreve no banco.
 */
import { test, expect } from "@playwright/test";
import { MANAGER_STATE, OPERATOR_STATE } from "../support/session";

test.describe("sessão do manager", () => {
  test.use({ storageState: MANAGER_STATE });

  test("cai logado em /manager/partners, sem passar pelo login", async ({ page }) => {
    await page.goto("/manager/partners");
    await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/manager\/partners/);
  });
});

test.describe("sessão do operator", () => {
  test.use({ storageState: OPERATOR_STATE });

  test("cai logado em /operator/recebimento, sem passar pelo login", async ({ page }) => {
    await page.goto("/operator/recebimento");
    await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/operator\/recebimento/);
  });
});
