#!/usr/bin/env node
/**
 * Renderiza um slide do Instagram a partir do template HTML, em 1080 x 1350, e
 * entrega o JPEG que a API aceita.
 *
 * Por que existe: a composição manual falha em silêncio. Se o `--foto` do
 * template apontar para um arquivo que não existe (o caso comum é o Higgsfield
 * devolver `.png` e o template esperar `.jpg`), o fundo cai no navy da marca e o
 * slide sai bonito, só que sem a foto, e ninguém percebe até estar publicado.
 * Este script confere cada imagem referenciada antes de renderizar e aborta com
 * a lista do que faltou.
 *
 * Ele também fecha o formato: 1080 x 1350 é 4:5, a proporção mais alta que o
 * Instagram aceita, e JPEG é o único formato que a API não recusa. Ver
 * ../references/api-instagram.md.
 *
 * Uso:
 *   node .claude/skills/instagram/scripts/render-slide.mjs <slide.html> [saida.jpg]
 *
 * Sem o segundo argumento, grava ao lado do HTML com o mesmo nome base.
 * Requer `bun install` (usa o chromium do @playwright/test, já declarado).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import pw from "@playwright/test";

const { chromium } = pw;

const LARGURA = 1080;
const ALTURA = 1350;
const QUALIDADE = 82;
const LIMITE_BYTES = 8 * 1024 * 1024;

const [entrada, saidaArg] = process.argv.slice(2);
if (!entrada) {
  console.error("uso: render-slide.mjs <slide.html> [saida.jpg]");
  process.exit(2);
}

const html = path.resolve(entrada);
if (!fs.existsSync(html)) {
  console.error(`não achei o HTML: ${html}`);
  process.exit(2);
}

const dir = path.dirname(html);
const saida = path.resolve(saidaArg || html.replace(/\.html?$/i, ".jpg"));
const temporario = saida.replace(/\.jpe?g$/i, ".render.png");

// ---- 1. toda imagem local referenciada tem que existir ----------------------
// É esta checagem que impede o slide sair sem foto e ninguém notar.
const fonte = fs.readFileSync(html, "utf8");
const referencias = [...fonte.matchAll(/url\(\s*["']?(?!data:|https?:)([^"')]+)["']?\s*\)/g)]
  .map((m) => m[1].trim())
  .filter((r) => r && !r.startsWith("#"));
const faltando = [...new Set(referencias)].filter((r) => !fs.existsSync(path.resolve(dir, r)));

if (faltando.length) {
  console.error("\nO slide referencia imagem que não existe, então ele sairia sem foto:\n");
  for (const f of faltando) {
    const alt = ["png", "jpg", "jpeg", "webp"]
      .map((ext) => r_troca(f, ext))
      .find((c) => fs.existsSync(path.resolve(dir, c)));
    console.error(`  ${f}${alt ? `   (existe ${alt}, confira a extensão)` : ""}`);
  }
  console.error("");
  process.exit(1);
}

function r_troca(arquivo, ext) {
  return arquivo.replace(/\.\w+$/, `.${ext}`);
}

// ---- 2. renderiza no tamanho exato ------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: LARGURA, height: ALTURA },
  deviceScaleFactor: 1,
});
await page.goto(`file://${html}`);
await page.waitForLoadState("networkidle");
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: temporario });
await browser.close();

// ---- 3. JPEG, que é o único formato que a API aceita -------------------------
execFileSync("sips", [
  "-s", "format", "jpeg",
  "-s", "formatOptions", String(QUALIDADE),
  temporario, "--out", saida,
], { stdio: "ignore" });
fs.unlinkSync(temporario);

const bytes = fs.statSync(saida).size;
const mb = (bytes / 1048576).toFixed(2);
console.log(`${path.basename(saida)}  ${LARGURA}x${ALTURA}  JPEG  ${mb} MB`);

if (bytes > LIMITE_BYTES) {
  console.error(`\nAcima do limite de 8 MB da API. Baixe a qualidade e rode de novo.\n`);
  process.exit(1);
}
