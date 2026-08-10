/**
 * Impersonation do hub_admin: entrar como operador de uma empresa e sair.
 *
 * Fecha o caso O-05 do roteiro do operador (docs/testes/roteiro-operador.md), que
 * estava sem rede de regressão.
 *
 * NÃO escreve no banco: impersonar mexe só na sessão local (`localStorage`, chave
 * `mp:impersonated-company-id`) e no estado do AuthProvider. Por isso este spec fica
 * na suíte normal do manager (project `e2e-manager`, sessão hub_admin mintada pelo
 * setup), sem a trava `tx` dos specs que escrevem em produção.
 *
 * O que se prova: o hub_admin troca o contexto para a empresa alvo (vira
 * `company_operator` com `effectiveCompanyIds` da empresa), o banner de aviso aparece
 * nomeando a empresa, e sair devolve o admin para o `/manager`.
 */
import { test, expect } from "@playwright/test";

/** Empresa alvo: a mesma do roteiro do dono, para o nome do banner ser conferível. */
const COMPANY = "Agência Fera";

test.describe("Impersonation do hub_admin", () => {
  test("O-05: hub_admin entra como operador da empresa e sai de volta pro manager", async ({
    page,
  }) => {
    await page.goto("/manager/companies");
    // `exact` evita casar com título de estado vazio que contenha a mesma palavra
    // (strict mode). Timeout largo porque a tela só monta depois que a sessão resolve.
    await expect(page.getByRole("heading", { name: "Empresas", exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // Filtra pela empresa alvo para não depender da ordem dos cards.
    await page.getByPlaceholder("Buscar por nome ou slug").fill(COMPANY);

    const entrar = page.getByRole("button", { name: "Entrar como operador" }).first();
    await expect(entrar).toBeVisible({ timeout: 15_000 });
    await entrar.click();

    // Entrou: o painel do operador abre e o banner avisa que o modo está ativo.
    await page.waitForURL(/\/operator\/?$/, { timeout: 15_000 });
    const banner = page.getByText("Modo impersonator ativo");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    // O banner nomeia a empresa: é a prova de que o contexto é o dela, não de outra.
    await expect(page.getByText(`Você está vendo o painel como operador de`)).toContainText(
      COMPANY,
    );

    // Sair devolve o admin para o /manager e tira o banner.
    await page.getByRole("button", { name: "Sair do modo operador" }).click();
    await page.waitForURL(/\/manager\/?$/, { timeout: 15_000 });
    await expect(banner).toBeHidden();
  });
});
