/**
 * T-05 do roteiro E1.3: kanban em tela cheia, sem o menu lateral no desktop.
 *
 * O roteiro marca este caso como FALTA, mas ele já está implementado em
 * `src/routes/manager/partners.tsx`: o modo tela cheia é um overlay
 * `fixed inset-0 z-50` com "Voltar" no topo.
 *
 * Cuidado ao mexer nas asserções: o menu é COBERTO, não desmontado. Ele segue
 * no DOM e visível pelo critério do Playwright, que não considera oclusão.
 * Um `toBeHidden()` no link do menu falharia com a feature funcionando. Por
 * isso o caso assere o overlay (cobre a viewport inteira) em vez da ausência
 * do menu.
 *
 * Somente leitura. Não escreve no banco.
 */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("T-05: tela cheia cobre a viewport inteira e traz o Voltar", async ({ page }) => {
  await page.goto("/manager/partners");
  await expect(page.getByText("Carregando…")).toBeHidden({ timeout: 20_000 });

  const abrir = page.getByRole("button", { name: "Tela cheia" });
  await expect(
    abrir,
    'o botão "Tela cheia" só aparece na visão kanban e com ao menos uma solicitação',
  ).toBeVisible();
  await abrir.click();

  const voltar = page.getByRole("button", { name: "Voltar" });
  await expect(voltar).toBeVisible();

  // O overlay tem que ocupar a viewport toda, que é o que esconde a sidebar.
  const overlay = page.locator("div.fixed.inset-0").filter({ has: voltar });
  const box = await overlay.boundingBox();
  const viewport = page.viewportSize()!;

  expect(box, "o overlay de tela cheia deveria estar na tela").not.toBeNull();
  expect(box!.x).toBe(0);
  expect(box!.y).toBe(0);
  expect(box!.width).toBe(viewport.width);
  expect(box!.height).toBe(viewport.height);

  // E o Voltar devolve para a visão normal, com a sidebar de volta.
  await voltar.click();
  await expect(page.getByRole("button", { name: "Tela cheia" })).toBeVisible();
});
