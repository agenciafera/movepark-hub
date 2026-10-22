#!/usr/bin/env node
/**
 * Gera a versão de story (1080 x 1920, 9:16) de um slide do feed (4:5).
 *
 * Por que existe: story só aceita uma imagem por vez, e a Meta recomenda 9:16 para não cortar
 * nem sobrar faixa vazia. O slide 4:5 entra inteiro no centro, sobre a própria imagem ampliada,
 * desfocada e escurecida, que é como o Instagram mostra post repostado nos stories. Nada do texto
 * do slide é cortado, e a tela fica cheia. Decisão do Kallef em 22/10/2026 (spec da fila).
 *
 * A API não aceita sticker de link em story, então o slide é a mensagem inteira.
 *
 * Prefira o HTML do slide como entrada: ele é renderizado de novo SEM a dica "arraste →", que no
 * carrossel manda passar para o lado e no story engana (arrastar para o lado pula para a próxima
 * conta). O JPEG do feed também é aceito, quando o HTML não existe mais, mas leva a dica junto.
 *
 * Uso:
 *   node .claude/skills/instagram/scripts/render-story.mjs <slide.html|slide.jpg> [saida.jpg]
 *
 * Sem o segundo argumento, grava ao lado da entrada como `<nome>-story.jpg`. Aceita várias:
 *   node .claude/skills/instagram/scripts/render-story.mjs a.jpg b.jpg c.jpg
 * (com mais de uma, cada saída vai ao lado da sua entrada). O envio da skill procura o story do
 * slide `x.jpg` como `x-story.jpg`: com HTML, passe a saída com esse nome.
 * Requer `bun install` (usa o chromium do @playwright/test, já declarado).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const LARGURA = 1080;
export const ALTURA = 1920;
const QUALIDADE = 82;
const LIMITE_BYTES = 8 * 1024 * 1024;

/** `estacionamento-01.jpg` → `estacionamento-01-story.jpg`. É o nome que o envio da skill procura. */
export const nomeDoStory = (arquivo) => arquivo.replace(/\.(jpe?g|html?)$/i, "") + "-story.jpg";

/** O que some do slide no story: a dica de arrastar do carrossel. */
export const CSS_SEM_ARRASTE = ".arraste{visibility:hidden !important}";

/** O HTML do story: o slide inteiro no centro, sobre ele mesmo desfocado. */
export function htmlDoStory(urlDoSlide) {
  const u = JSON.stringify(urlDoSlide);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${LARGURA}px;height:${ALTURA}px;overflow:hidden;background:#29263F}
.fundo{position:absolute;inset:-80px;background:url(${u}) center/cover no-repeat;
  filter:blur(48px) brightness(.55) saturate(1.1)}
.slide{position:absolute;left:0;top:50%;width:${LARGURA}px;transform:translateY(-50%);
  display:block;box-shadow:0 24px 64px rgba(0,0,0,.45)}
</style></head><body><div class="fundo"></div><img class="slide" src=${u} alt=""></body></html>`;
}

/** O slide do feed renderizado de novo a partir do HTML, sem a dica de arrastar, em PNG. */
async function slideSemArraste(browser, html, destino) {
  const page = await browser.newPage({ viewport: { width: LARGURA, height: 1350 }, deviceScaleFactor: 1 });
  const falharam = [];
  page.on("requestfailed", (req) => req.resourceType() === "image" && falharam.push(req.url()));
  await page.goto(pathToFileURL(html).href);
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: CSS_SEM_ARRASTE });
  await page.evaluate(() => document.fonts.ready);
  if (falharam.length) {
    await page.close();
    throw new Error(`${path.basename(html)} tentou carregar imagem que não existe: ${falharam.join(", ")}`);
  }
  await page.screenshot({ path: destino });
  await page.close();
}

async function renderizar(browser, entradaOriginal, saida) {
  let entrada = entradaOriginal;
  const slidePng = saida.replace(/\.jpe?g$/i, ".slide.png");
  if (/\.html?$/i.test(entradaOriginal)) {
    await slideSemArraste(browser, entradaOriginal, slidePng);
    entrada = slidePng;
  }
  const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1 });
  const temporario = saida.replace(/\.jpe?g$/i, ".render.png");
  // Página file:// para a imagem file:// carregar (about:blank não lê arquivo local).
  const pagina = saida.replace(/\.jpe?g$/i, ".render.html");
  fs.writeFileSync(pagina, htmlDoStory(pathToFileURL(entrada).href));
  await page.goto(pathToFileURL(pagina).href);
  fs.unlinkSync(pagina);
  const img = await page.evaluate(async () => {
    const el = document.querySelector(".slide");
    await el.decode().catch(() => {});
    return { w: el.naturalWidth, h: el.naturalHeight };
  });
  if (!img.w || !img.h) {
    await page.close();
    throw new Error(`não consegui abrir ${entrada} como imagem`);
  }
  const proporcao = img.w / img.h;
  if (Math.abs(proporcao - 0.8) > 0.01) {
    await page.close();
    throw new Error(`${path.basename(entrada)} está em ${img.w}x${img.h}; o slide do feed é 4:5 (1080x1350).`);
  }
  await page.screenshot({ path: temporario });
  await page.close();
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(QUALIDADE), temporario, "--out", saida], {
    stdio: "ignore",
  });
  fs.unlinkSync(temporario);
  if (entrada === slidePng) fs.unlinkSync(slidePng);
  const bytes = fs.statSync(saida).size;
  if (bytes > LIMITE_BYTES) throw new Error(`${path.basename(saida)} passou de 8 MB. Baixe a qualidade.`);
  return bytes;
}

const ehPrincipal = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (ehPrincipal) {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("uso: render-story.mjs <slide.jpg> [saida.jpg]  |  render-story.mjs a.jpg b.jpg ...");
    process.exit(2);
  }
  // Dois argumentos e o segundo é um `-story.jpg`: é o par entrada → saída (pode já existir).
  const pares =
    args.length === 2 && /-story\.jpe?g$/i.test(args[1])
      ? [[path.resolve(args[0]), path.resolve(args[1])]]
      : args.map((a) => [path.resolve(a), path.resolve(path.dirname(a), nomeDoStory(path.basename(a)))]);
  for (const [entrada] of pares) {
    if (!fs.existsSync(entrada)) {
      console.error(`não achei o slide: ${entrada}`);
      process.exit(2);
    }
  }
  const { chromium } = (await import("@playwright/test")).default;
  const browser = await chromium.launch();
  try {
    for (const [entrada, saida] of pares) {
      const bytes = await renderizar(browser, entrada, saida);
      console.log(`${path.basename(saida)}  ${LARGURA}x${ALTURA}  JPEG  ${(bytes / 1048576).toFixed(2)} MB`);
    }
  } catch (e) {
    console.error(`\n${e.message}\n`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
