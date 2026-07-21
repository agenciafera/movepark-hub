/**
 * T-04 do roteiro E1.3: o card aparece no kanban e muda de coluna.
 *
 * A esteira tem uma só ação manual de avanço: o manager arrasta Pendente para
 * "Aprovado", o que dispara `approve` (`src/routes/manager/partners.tsx`), envia
 * o convite e leva o status para `approved`. As colunas "Em cadastro"
 * (`in_progress`) e "Ativo" (`active`) NÃO são alvo de arrasto: quem chega nelas
 * é o próprio parceiro, ao salvar/publicar o wizard (auto-transição no backend).
 * Por isso `canMoveToColumn` recusa esses destinos (`PartnersKanban.logic.ts`).
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

test("T-04: card aparece em Pendente e arrastar para Aprovado leva a company para approved", async ({ page }) => {
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
  const aprovado = page.getByTestId("kanban-col-approved");

  // Pré-condição: o card nasce na coluna Pendente.
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(pendente.getByTestId(`kanban-card-${company!.id}`)).toBeVisible();

  // A ação manual do manager: arrastar para "Aprovado" (dispara approve + convite).
  await dragHtml5(page, card, aprovado);

  await expect
    .poll(async () => (await getCompany())?.onboarding_status, {
      timeout: 30_000,
      intervals: [500, 1000, 2000],
      message: "o arrasto para Aprovado deveria ter disparado a Edge approve-partner",
    })
    .toBe("approved");

  // E a UI acompanha: o card assenta em Aprovado.
  await expect(page.getByTestId("kanban-col-approved").getByTestId(`kanban-card-${company!.id}`))
    .toBeVisible({ timeout: 20_000 });
});
