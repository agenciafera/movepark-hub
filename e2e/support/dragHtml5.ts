/**
 * Drag and drop para o kanban, que usa DnD nativo do HTML5 (`draggable`,
 * `onDragStart`, `onDrop`), não dnd-kit.
 *
 * O `locator.dragTo()` do Playwright não fez o Chromium disparar o dragstart
 * neste caso. O que funciona é conduzir o mouse na mão, com movimento em
 * passos: o Chromium só entra em modo de arrasto depois de um deslocamento
 * perceptível com o botão pressionado, e o alvo precisa receber mais de um
 * `dragover` antes do `drop`.
 *
 * Mantemos o caminho pelo mouse de propósito, em vez de disparar DragEvent
 * sintético. Evento sintético ignoraria o atributo `draggable` e passaria
 * mesmo que o arrasto estivesse quebrado para gente de verdade.
 */
import type { Locator, Page } from "@playwright/test";

export async function dragHtml5(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("[e2e] origem ou destino do arrasto não está na tela.");

  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + Math.min(to.height / 2, 120) };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  // Primeiro passo curto: é o que tira o Chromium do clique e inicia o arrasto.
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 6 });
  // Depois caminha até o alvo, dando tempo de o dragover pintar a coluna.
  await page.mouse.move(end.x, end.y, { steps: 24 });
  await page.mouse.move(end.x, end.y + 4, { steps: 6 });

  await page.mouse.up();
}
