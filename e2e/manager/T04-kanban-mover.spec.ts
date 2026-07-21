/**
 * T-04 do roteiro E1.3: o card aparece no kanban e muda de coluna.
 *
 * DIVERGÊNCIA DO ROTEIRO, confirmada no código. O roteiro descreve
 * "Pendente -> Em cadastro -> Aprovado", com o status passando por
 * `in_progress`. Não é o que acontece:
 *
 *   - soltar em "Em cadastro" OU em "Aprovado" dispara a mesma ação `approve`
 *     (`src/routes/manager/partners.tsx`), que leva o status direto para
 *     `approved`. O card assenta em "Aprovado", não em "Em cadastro";
 *   - por isso o segundo arrasto do roteiro não existe. E, mesmo que se
 *     tentasse, `canMoveToColumn` proíbe `in_progress -> approved`
 *     (`PartnersKanban.logic.ts`).
 *
 * Este spec testa o comportamento real. Se a intenção do produto for mesmo ter
 * uma parada em `in_progress`, o teste é que está certo e o código é que
 * precisa mudar.
 *
 * O drag é HTML5 nativo, não dnd-kit. `dragTo` funciona no Chromium, mas este
 * é o caso mais frágil da suíte.
 *
 * ESCREVE em produção. Aprovar dispara o e-mail de convite para o lead.
 */
import { test, expect } from "@playwright/test";
import { cleanupFixture, getCompany } from "../support/db";
import { submitFullLead } from "../support/leadFlow";
import { dragHtml5 } from "../support/dragHtml5";

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async () => {
  await cleanupFixture();
});

test.afterEach(async () => {
  await cleanupFixture();
});

test("T-04: card aparece em Pendente e aprovar leva a company para approved", async ({ page }) => {
  // Cria a solicitação pelo caminho real, o funil público. A rota é pública,
  // então roda mesmo neste contexto autenticado como manager.
  const modal = await submitFullLead(page);
  await expect(modal.getByText("Recebemos seu cadastro")).toBeVisible();

  const company = await getCompany();
  expect(company!.onboarding_status).toBe("pending_review");

  await page.goto("/manager/partners");
  await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });

  const card = page.getByTestId(`kanban-card-${company!.id}`);
  const pendente = page.getByTestId("kanban-col-pending_review");
  const emCadastro = page.getByTestId("kanban-col-in_progress");

  // Pré-condição: o card nasce na coluna Pendente.
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(pendente.getByTestId(`kanban-card-${company!.id}`)).toBeVisible();

  await dragHtml5(page, card, emCadastro);

  // O efeito real é `approved`, não `in_progress`. Ver o cabeçalho do arquivo.
  await expect
    .poll(async () => (await getCompany())?.onboarding_status, {
      timeout: 30_000,
      intervals: [500, 1000, 2000],
      message: "o arrasto deveria ter disparado a Edge approve-partner",
    })
    .toBe("approved");

  // E a UI acompanha: o card assenta em Aprovado.
  await expect(page.getByTestId("kanban-col-approved").getByTestId(`kanban-card-${company!.id}`))
    .toBeVisible({ timeout: 20_000 });
});
