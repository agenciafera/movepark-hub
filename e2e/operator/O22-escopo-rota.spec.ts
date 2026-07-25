/**
 * O-22 do roteiro do operador (docs/testes/roteiro-operador.md): rota gateada por
 * escopo devolve o usuário pro dashboard.
 *
 * É a última lacuna de regressão da área do parceiro. Prova o espelho de front do
 * ADR-005: `RequireScope` manda de volta pro `/operator` quem não tem o escopo da
 * rota. O lado servidor (RPC devolvendo 42501) já é coberto pelo pgTAP
 * `operator_rpc_scope.test.sql`; aqui o alvo é o gate de navegação.
 *
 * POR QUE REBAIXAR O PAPEL: o Dono tem TODOS os escopos e o hub_admin fura todo gate
 * (`hasScope` sempre true), então com eles nada é negado e o teste não provaria nada.
 * O único jeito de ver a negação no navegador é o usuário ter um papel restrito. Por
 * isso o caso roda na fixture Mercy (descartável), rebaixando o vínculo para
 * **Operação** (`operator`), que tem `occupancy:read` mas não tem `pricing:write` nem
 * `finance:read`. Nunca faça isso com o dono do Abbapark, que é parceiro real.
 *
 * O controle positivo (Ocupação, que o papel TEM) está aqui de propósito: sem ele, o
 * teste passaria mesmo se a área inteira estivesse quebrada e tudo caísse no dashboard.
 *
 * ESCREVE em produção: semeia e apaga a company da fixture Mercy (mesmo padrão dos
 * T-07/T-10/T-15/T-16). O papel rebaixado morre junto com a company no teardown, e
 * `seedFixtureCompany` (que os outros specs chamam) reescreve `owner` de qualquer jeito.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, seedFixtureCompany, setFixtureMemberRole } from "../support/db";

test.setTimeout(90_000);

let companyId: string;

test.beforeEach(async () => {
  await cleanupFixture();
  companyId = await seedFixtureCompany("approved");
  // Operação: tem occupancy:read, não tem pricing:write nem finance:read.
  await setFixtureMemberRole(companyId, "operator");
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("O-22: rota sem o escopo do papel devolve pro dashboard, e a permitida abre", async ({
  page,
}) => {
  // Preços exige `pricing:write`. O papel Operação não tem: volta pro dashboard.
  await page.goto("/operator/pricing");
  await page.waitForURL(/\/operator\/?$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });

  // Repasses exige `finance:read`. Também não tem: mesmo destino.
  await page.goto("/operator/finance");
  await page.waitForURL(/\/operator\/?$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });

  // CONTROLE POSITIVO: Ocupação exige `occupancy:read`, que o papel TEM. Se esta
  // parte falhar junto com as de cima, o problema não é o gate de escopo.
  await page.goto("/operator/occupancy");
  await expect(page.getByRole("heading", { name: "Ocupação" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/operator\/occupancy/);
});
