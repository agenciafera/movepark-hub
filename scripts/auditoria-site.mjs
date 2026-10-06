#!/usr/bin/env node
/**
 * Auditoria do site inteiro NO AR, a partir do sitemap. Faz o papel da auditoria do Semrush, que
 * no plano gratuito para em 100 páginas (docs/specs/plano-autoridade-backlinks.md, seção 2.6).
 *
 * O que confere em cada URL do sitemap:
 *   - responde 200 direto (sitemap não pode listar redirect nem 404);
 *   - sem `noindex` (meta ou X-Robots-Tag) e com canonical apontando para ela mesma;
 *   - title e description presentes e não duplicados entre páginas; um H1 só;
 *   - todo link interno abre (link para 404 é erro, para redirect é aviso);
 *   - alguma outra página linka para ela (órfã é aviso);
 *   - links de saída abrem (pule com `--sem-externos`).
 *
 * É rotina, não checagem de uma vez: o conteúdo se publica sozinho a partir do Manager
 * (docs/specs/deploy-automatico.md), então uma página pode quebrar sem commit de código nenhum.
 * Roda toda segunda no `.github/workflows/auditoria-site.yml`.
 *
 * Uso:
 *   bun run seo:auditoria                                   # https://movepark.co
 *   bun run seo:auditoria -- --sem-externos                 # só o site
 *   bun run seo:auditoria -- --saida relatorio.md --json relatorio.json
 *   node scripts/auditoria-site.mjs http://localhost:4173   # contra o preview
 *
 * Sai com código 1 quando há ERRO. Aviso e informativo não reprovam.
 */

import { writeFileSync } from "node:fs";

import { DEFAULT_SITE_URL } from "../src/lib/site-host.mjs";
import {
  diagnostica,
  fatosDaPagina,
  locsDoSitemap,
  relatorioMarkdown,
} from "./auditoria-site.logic.mjs";

const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = (args.find((a) => /^https?:\/\//.test(a)) ?? DEFAULT_SITE_URL).replace(/\/+$/, "");
const SEM_EXTERNOS = args.includes("--sem-externos");
const SAIDA_MD = opcao("--saida");
const SAIDA_JSON = opcao("--json");
const CONCORRENCIA = Number(opcao("--concorrencia") ?? 6);

const HEADERS = { "User-Agent": "MoveparkAuditoria/1.0 (+https://movepark.co)" };
const TIMEOUT_MS = 30_000;

/** Busca com timeout e uma segunda tentativa em falha de rede ou 5xx, para não acusar soluço. */
async function busca(url, init = {}) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const r = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...init,
      });
      if (r.status >= 500 && tentativa < 2) continue;
      return r;
    } catch (e) {
      if (tentativa >= 2) throw e;
    }
  }
}

/** Roda `fn` sobre `itens` com no máximo `n` em paralelo. */
async function emLotes(itens, n, fn) {
  const fila = [...itens];
  let feitos = 0;
  const trabalhadores = Array.from({ length: Math.min(n, fila.length) }, async () => {
    while (fila.length) {
      await fn(fila.shift());
      feitos++;
      if (feitos % 100 === 0) console.error(`  ${feitos}/${itens.length}`);
    }
  });
  await Promise.all(trabalhadores);
}

async function urlsDoSitemap() {
  const indice = locsDoSitemap(await (await busca(`${BASE}/sitemap.xml`)).text());
  const filhos = indice.filter((u) => u.endsWith(".xml"));
  if (filhos.length === 0) return indice;
  const urls = [];
  for (const s of filhos) urls.push(...locsDoSitemap(await (await busca(s)).text()));
  // O sitemap é escrito com o host canônico; contra o preview, troca para a origem auditada.
  return [...new Set(urls)].map((u) => BASE + new URL(u).pathname);
}

const inicio = Date.now();
const urls = await urlsDoSitemap();
console.error(`${urls.length} URLs no sitemap de ${BASE}`);

const paginas = new Map();
await emLotes(urls, CONCORRENCIA, async (url) => {
  try {
    const r = await busca(url, { redirect: "manual" });
    const p = {
      status: r.status,
      location: r.headers.get("location"),
      xRobots: r.headers.get("x-robots-tag"),
    };
    if (r.status === 200) p.fatos = fatosDaPagina(await r.text(), url);
    else await r.body?.cancel();
    paginas.set(url, p);
  } catch (e) {
    paginas.set(url, { status: 0, location: `erro: ${e.message}` });
  }
});

const noSitemap = new Set(urls.map((u) => new URL(u).pathname));
const alvos = new Set();
const saidas = new Set();
for (const p of paginas.values()) {
  for (const c of p.fatos?.internos ?? []) if (!noSitemap.has(c)) alvos.add(c);
  for (const u of p.fatos?.externos ?? []) saidas.add(u);
}

console.error(`${alvos.size} caminhos linkados fora do sitemap`);
const alvosInternos = new Map();
await emLotes([...alvos], CONCORRENCIA, async (caminho) => {
  try {
    const r = await busca(BASE + caminho, { redirect: "manual" });
    await r.body?.cancel();
    alvosInternos.set(caminho, { status: r.status, location: r.headers.get("location") });
  } catch {
    alvosInternos.set(caminho, { status: 0 });
  }
});

let externos;
if (!SEM_EXTERNOS) {
  console.error(`${saidas.size} links de saída`);
  externos = new Map();
  await emLotes([...saidas], CONCORRENCIA, async (url) => {
    try {
      // HEAD primeiro, que é barato; muito servidor responde 405 ou 404 a HEAD e abre no GET.
      let r = await busca(url, { method: "HEAD", redirect: "follow" });
      if (r.status >= 400) r = await busca(url, { redirect: "follow" });
      await r.body?.cancel();
      externos.set(url, { status: r.status });
    } catch (e) {
      externos.set(url, { status: 0, erro: e.cause?.code ?? e.name ?? e.message });
    }
  });
}

const problemas = diagnostica({
  paginas,
  alvosInternos,
  externos,
  base: BASE,
  hostCanonico: new URL(DEFAULT_SITE_URL).hostname,
});
const data = new Date().toISOString().slice(0, 10);
const md = relatorioMarkdown({ problemas, base: BASE, totalPaginas: urls.length, data });

console.log(md);
if (SAIDA_MD) writeFileSync(SAIDA_MD, md);
if (SAIDA_JSON) {
  writeFileSync(
    SAIDA_JSON,
    JSON.stringify({ base: BASE, data, totalPaginas: urls.length, problemas }, null, 2),
  );
}

const erros = problemas.filter((p) => p.severidade === "erro").length;
console.error(`Concluída em ${Math.round((Date.now() - inicio) / 1000)}s, ${erros} erro(s).`);
process.exit(erros === 0 ? 0 : 1);
