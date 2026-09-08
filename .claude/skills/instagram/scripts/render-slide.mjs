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

// ---- 1. mapeia as imagens locais citadas, para dar dica boa depois ----------
// Este bloco NAO bloqueia: uma `url()` citada no CSS pode nunca ser usada (as
// variantes `dado` e `texto` do template sobrescrevem o background e deixam a
// variavel --foto sem uso). Quem bloqueia e a requisicao que falha de verdade,
// no passo 2.
const fonte = fs.readFileSync(html, "utf8");
const citadas = [...fonte.matchAll(/url\(\s*["']?(?!data:|https?:)([^"')]+)["']?\s*\)/g)]
  .map((m) => m[1].trim())
  .filter((r) => r && !r.startsWith("#"));

/** Sugere o mesmo arquivo com outra extensão, que é o erro mais comum. */
function dica(alvo) {
  const base = decodeURIComponent(alvo.split("/").pop() || "");
  const irmao = ["png", "jpg", "jpeg", "webp"]
    .map((ext) => base.replace(/\.\w+$/, `.${ext}`))
    .find((c) => c !== base && fs.existsSync(path.resolve(dir, c)));
  return irmao ? `   (existe ${irmao}, confira a extensão)` : "";
}

// ---- 2. renderiza no tamanho exato ------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: LARGURA, height: ALTURA },
  deviceScaleFactor: 1,
});

// A falha que motivou este script: o --foto apontando para arquivo inexistente.
// O fundo cai no navy da marca, o slide sai bonito e sem foto, e nada avisa.
const falharam = new Set();
page.on("requestfailed", (req) => {
  if (req.resourceType() === "image") falharam.add(req.url());
});

await page.goto(`file://${html}`);
await page.waitForLoadState("networkidle");
await page.evaluate(() => document.fonts.ready);

if (falharam.size) {
  await browser.close();
  console.error("\nO slide tentou carregar imagem que não existe, então sairia sem foto:\n");
  for (const u of falharam) {
    const rel = citadas.find((c) => u.endsWith(encodeURI(c.replace(/^\.\//, "")))) || u;
    console.error(`  ${rel}${dica(u)}`);
  }
  console.error("");
  process.exit(1);
}

// ---- 2b. o CSS do template aplicou? -----------------------------------------
// Slide em branco é um JPEG válido de 1080x1350 e passa em toda checagem de
// dimensão. Já aconteceu: um replace de `<body>` casou com o `<body>` que
// aparece dentro do comentário do template e levou o `<head>` junto. O sintoma
// era zero, o slide só saía branco. `background-color` transparente no body
// significa que nenhuma folha de estilo pegou, porque o template sempre pinta.
const estado = await page.evaluate(() => {
  const cs = getComputedStyle(document.body);
  return {
    fundo: cs.backgroundColor,
    imagem: cs.backgroundImage,
    fonte: cs.fontFamily,
    texto: (document.body.innerText || "").trim().length,
    exemplos: [...document.querySelectorAll("[data-exemplo]")].map((e) =>
      (e.innerText || "").trim().slice(0, 60),
    ),
  };
});

const semFundo = estado.fundo === "rgba(0, 0, 0, 0)" && estado.imagem === "none";
if (semFundo) {
  await browser.close();
  console.error("\nO body não recebeu fundo nenhum, então o CSS do template não aplicou.");
  console.error("O slide sairia em branco. Confira se o <head> e o <style> sobreviveram");
  console.error("à edição do arquivo.\n");
  process.exit(1);
}
if (!estado.texto) {
  await browser.close();
  console.error("\nO slide renderizou sem texto visível. Confira o corpo do HTML.\n");
  process.exit(1);
}
// O conteúdo de demonstração do template carrega `data-exemplo`. Se ele
// sobreviveu, ou a edição não aconteceu, ou ela foi desfeita sem ninguém ver.
// Aconteceu: um `String.replace` cuja copy tinha "R$&nbsp;" fez o `$&` reinserir
// o body inteiro do template, e o slide saiu com o texto de exemplo duplicado.
if (estado.exemplos.length) {
  await browser.close();
  console.error("\nO slide ainda tem conteúdo de exemplo do template:\n");
  for (const e of estado.exemplos) console.error(`  "${e}"`);
  console.error("\nEdite o texto e remova o atributo data-exemplo.\n");
  process.exit(1);
}

if (!/Inter/i.test(estado.fonte)) {
  console.warn(`aviso: a fonte do body é ${estado.fonte}, e a da marca é Inter.`);
}

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
