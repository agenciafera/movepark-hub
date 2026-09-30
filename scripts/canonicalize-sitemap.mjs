#!/usr/bin/env node
/**
 * Pós-processa o `dist/sitemap.xml` em duas frentes:
 *
 * 1. Repõe a barra final nas URLs do blog EM PORTUGUÊS. O `vite-plugin-sitemap`
 *    normaliza todo path removendo a barra, e não tem opção para desligar. Para o
 *    blog português a canônica é `/blog/<slug>/`, herdada do WordPress, e é ela que
 *    responde 200 (ver `blogRedirect` em src/worker.ts). Sem a correção o sitemap
 *    anunciaria como canônica exatamente a forma que redireciona (301).
 *
 *    Os idiomas TRADUZIDOS ficam de fora, e é o oposto: `normalizaBarraFinal` no
 *    worker só abre exceção para caminho que começa em `/blog/`, então `/en/blog/x/`
 *    é 301 para `/en/blog/x`. A regra original casava `.../blog/...` em qualquer
 *    posição e vinha carimbando barra nas 36 URLs traduzidas, contra a canônica que
 *    a própria página publica. URL nova não tem legado do WordPress para honrar.
 *
 * 2. Remove as áreas privadas. O plugin descobre as rotas estáticas sozinho e
 *    arrasta /manager, /operator, /account e afins para o sitemap; anunciar rota
 *    logada ao buscador é pedir crawl de página que responde login.
 */

import fs from "node:fs";

const SITEMAP = "dist/sitemap.xml";

/** Prefixos de path que nunca entram no sitemap (área logada/fluxo transacional). */
const PRIVADOS = [
  "/manager",
  // Leitura de conversa compartilhada: o token vive na URL. Ver ROTAS_PRIVADAS no worker.
  "/conversa",
  "/operator",
  "/account",
  "/bookings",
  "/checkout",
  "/voucher",
  "/onboarding",
  "/motor-preview",
  "/design-system",
  // Doc da API e do MCP: interna por decisão. Ver ROTAS_PRIVADAS no worker.
  "/docs",
  "/descadastro",
  "/auth",
  // Segredo do link de acesso ao Recebimento no caminho.
  "/acesso",
  "/finance",
  "/api-keys",
  "/parking-types",
  "/complete-profile",
];

if (!fs.existsSync(SITEMAP)) {
  console.error(`${SITEMAP} não existe. Rode o build antes.`);
  process.exit(1);
}

const original = fs.readFileSync(SITEMAP, "utf8");

// Depois do `split-sitemap.mjs` o `sitemap.xml` vira um índice, e as URLs moram nos shards.
// Rodar o canonicalize de novo sobre o índice não acharia bloco `<url>` nenhum e passaria
// em silêncio, dando a impressão de que a correção foi aplicada.
if (original.includes("<sitemapindex")) {
  console.error(`${SITEMAP} já é um índice. Rode o build inteiro em vez deste script sozinho.`);
  process.exit(1);
}

// Só o blog em PORTUGUÊS (o path começa em `/blog`), e só quando ainda não termina
// em barra. O `[^/<\s]+` depois do host impede que `/en/blog/...` case aqui.
let corrigido = original.replace(
  /(<loc>https?:\/\/[^/<\s]+\/blog(?:\/[^<\s]*[^/<\s])?)(<\/loc>)/g,
  "$1/$2",
);

// Derruba os blocos <url> de área privada.
let removidos = 0;
corrigido = corrigido.replace(/<url>[\s\S]*?<\/url>/g, (bloco) => {
  const loc = bloco.match(/<loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>/);
  const pathname = loc?.[1] ?? "/";
  const privado = PRIVADOS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (privado) {
    removidos += 1;
    return "";
  }
  return bloco;
});

fs.writeFileSync(SITEMAP, corrigido);
console.log(`sitemap: ${removidos} URLs de área privada removidas`);

/*
  O guard conta só o blog em PORTUGUÊS, pelo mesmo motivo da regra acima: nos idiomas
  traduzidos a canônica é SEM barra, e contá-los aqui fazia o build reprovar exatamente
  as 36 URLs que estavam certas.

  Os dois contadores existem para o caso de a regra parar de casar (o plugin muda a
  normalização, alguém mexe na expressão): "0 com barra" e "0 sem barra" se distinguem,
  e o segundo é o que reprova.
*/
const SO_PT = /<loc>https?:\/\/[^/<\s]+\/blog\/[^<]*<\/loc>/g;
const SO_PT_SEM_BARRA = /<loc>https?:\/\/[^/<\s]+\/blog\/[^<]*[^/]<\/loc>/g;
const total = [...corrigido.matchAll(SO_PT)].length;
const semBarra = [...corrigido.matchAll(SO_PT_SEM_BARRA)].length;
const traduzidas = [...corrigido.matchAll(/<loc>[^<]*\/(?:en|es)\/blog[^<]*<\/loc>/g)].length;
const traduzidasComBarra = [...corrigido.matchAll(/<loc>[^<]*\/(?:en|es)\/blog[^<]*\/<\/loc>/g)].length;

console.log(
  `sitemap: ${total} URLs do blog em português com barra final, ${semBarra} sem;` +
    ` ${traduzidas} traduzidas, ${traduzidasComBarra} com barra`,
);
if (semBarra > 0) {
  console.error("alguma URL do blog em português ficou sem a barra final");
  process.exit(1);
}
if (traduzidasComBarra > 0) {
  console.error("alguma URL do blog traduzida ganhou barra final, que a borda 301");
  process.exit(1);
}
