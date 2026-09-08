#!/usr/bin/env node
/**
 * Avisa os buscadores do que mudou, pelo protocolo IndexNow.
 *
 * O site é SSG: o que está no ar é o retrato do último build. Sem este aviso, o Bing só
 * descobre conteúdo novo quando resolve rastrear de novo, o que leva dias. Como a busca do
 * ChatGPT se apoia no índice da Microsoft, esse atraso é atraso de citação em IA.
 *
 * O delta sai da comparação entre o sitemap recém-construído (em `dist/`) e o que ainda está
 * no ar (a publicação anterior). Não existe arquivo de estado: o próprio site publicado é o
 * estado, o que mantém o script sem memória para versionar e sem sujar o `git status`.
 *
 * Uso:
 *   node scripts/indexnow-ping.mjs                        # no build; só no Workers Builds
 *   node scripts/indexnow-ping.mjs --simular              # mostra o que iria, não envia
 *   node scripts/indexnow-ping.mjs --tudo --do-ar --forcar   # estreia, do sitemap publicado
 *
 * Falha aqui **não derruba o build**: um buscador que não recebeu o aviso descobre pelo
 * sitemap do mesmo jeito, e derrubar a publicação por causa disso seria trocar um atraso de
 * horas por um site sem atualização nenhuma.
 *
 * Contexto em docs/specs/indexnow.md.
 */

import fs from "node:fs";
import path from "node:path";

import { DEFAULT_SITE_URL } from "../src/lib/site-host.mjs";
import {
  CHAVE,
  ENDPOINT,
  apenasDoHost,
  chaveValida,
  deveDisparar,
  lotes,
  montarPayload,
  shardsDoIndice,
  urlsDoSitemap,
  urlsParaSubmeter,
} from "./indexnow.logic.mjs";

const HOST = new URL(DEFAULT_SITE_URL).host;
const DIST = "dist";

const simular = process.argv.includes("--simular");
const forcar = process.argv.includes("--forcar");
const tudo = process.argv.includes("--tudo");
// A fonte padrão é o `dist` recém-construído, porque no build é ele que vai ao ar. `--do-ar`
// troca a fonte pelo site publicado, que é o certo para a estreia: ali o `dist` local pode
// ser de um build velho e anunciar URL que não existe mais.
const doAr = process.argv.includes("--do-ar");

/** Lê o índice e os shards do `dist`, devolvendo a lista completa de URLs com `lastmod`. */
function urlsDoDist() {
  const indice = path.join(DIST, "sitemap.xml");
  if (!fs.existsSync(indice)) return null;
  const xml = fs.readFileSync(indice, "utf8");
  const shards = shardsDoIndice(xml);
  if (shards.length === 0) return urlsDoSitemap(xml);
  return shards.flatMap((loc) => {
    const arquivo = path.join(DIST, new URL(loc).pathname);
    return fs.existsSync(arquivo) ? urlsDoSitemap(fs.readFileSync(arquivo, "utf8")) : [];
  });
}

/** Mesma leitura, mas contra o site publicado, que é a fotografia da publicação anterior. */
async function urlsDoAr() {
  const resposta = await fetch(`https://${HOST}/sitemap.xml`);
  if (!resposta.ok) throw new Error(`sitemap no ar respondeu ${resposta.status}`);
  const xml = await resposta.text();
  const shards = shardsDoIndice(xml);
  if (shards.length === 0) return urlsDoSitemap(xml);
  const paginas = await Promise.all(
    shards.map(async (loc) => {
      const r = await fetch(loc);
      return r.ok ? urlsDoSitemap(await r.text()) : [];
    }),
  );
  return paginas.flat();
}

async function enviar(urls) {
  for (const lote of lotes(urls)) {
    const resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(montarPayload({ host: HOST, chave: CHAVE, urls: lote })),
    });
    // 200 aceito, 202 aceito e em validação da chave. Os dois são sucesso.
    const detalhe = resposta.ok ? "" : ` ${(await resposta.text()).slice(0, 200)}`;
    console.log(`  IndexNow: ${lote.length} URLs, resposta ${resposta.status}${detalhe}`);
    if (resposta.status === 429) {
      console.log("  429 é excesso de submissão: o delta veio grande demais ou repetido.");
    }
  }
}

async function principal() {
  if (!chaveValida(CHAVE)) throw new Error(`chave de IndexNow inválida: ${CHAVE}`);

  const arquivoDaChave = path.join("public", `${CHAVE}.txt`);
  if (!fs.existsSync(arquivoDaChave)) {
    throw new Error(`falta ${arquivoDaChave}: sem o arquivo na raiz o buscador devolve 403`);
  }

  const decisao = deveDisparar(process.env, { forcar });
  if (!decisao.sim && !simular) {
    console.log(`IndexNow: pulado (${decisao.motivo}).`);
    return;
  }

  let atual;
  if (doAr) {
    atual = await urlsDoAr();
  } else {
    atual = urlsDoDist();
    if (atual === null) {
      console.log("IndexNow: pulado (não há dist/sitemap.xml; rode depois do build).");
      return;
    }
  }

  let urls;
  if (tudo) {
    urls = [...new Set(atual.map((u) => u.loc))];
    console.log(`IndexNow: submissão completa, ${urls.length} URLs do sitemap.`);
  } else {
    let anterior;
    try {
      anterior = await urlsDoAr();
    } catch (erro) {
      // Sem a publicação anterior não dá para saber o que mudou, e mandar tudo por engano é
      // como o protocolo devolve 429. Ficar quieto é o comportamento seguro.
      console.log(`IndexNow: pulado (não li o sitemap no ar: ${erro.message}).`);
      return;
    }
    urls = urlsParaSubmeter(atual, anterior);
    console.log(`IndexNow: ${urls.length} URLs mudaram desde a publicação no ar.`);
  }

  urls = apenasDoHost(urls, HOST);
  if (urls.length === 0) {
    console.log("IndexNow: nada a submeter.");
    return;
  }

  if (simular) {
    console.log(urls.slice(0, 20).join("\n"));
    if (urls.length > 20) console.log(`... e mais ${urls.length - 20}`);
    console.log(`IndexNow: simulação, nada foi enviado (${urls.length} URLs).`);
    return;
  }

  await enviar(urls);
}

principal().catch((erro) => {
  // Sai com 0 de propósito: o aviso é otimização de descoberta, não parte da publicação.
  console.log(`IndexNow: falhou sem derrubar o build (${erro.message}).`);
});
