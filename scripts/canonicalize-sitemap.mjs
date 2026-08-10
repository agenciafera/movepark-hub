#!/usr/bin/env node
/**
 * Repõe a barra final nas URLs do blog dentro do `dist/sitemap.xml`.
 *
 * O `vite-plugin-sitemap` normaliza todo path removendo a barra final, e não tem
 * opção para desligar isso. Para o resto do site tanto faz, porque as URLs do Hub
 * nasceram sem barra. Para o blog não: a canônica é `/blog/<slug>/`, herdada do
 * WordPress, e é ela que responde 200 (ver `blogRedirect` em src/worker.ts).
 *
 * Sem esta correção o sitemap entregaria ao Google 94 URLs que respondem 301,
 * ou seja, anunciaria como canônica exatamente a forma que redireciona.
 */

import fs from "node:fs";

const SITEMAP = "dist/sitemap.xml";

if (!fs.existsSync(SITEMAP)) {
  console.error(`${SITEMAP} não existe. Rode o build antes.`);
  process.exit(1);
}

const original = fs.readFileSync(SITEMAP, "utf8");

// Só as URLs do blog, e só quando ainda não terminam em barra.
const corrigido = original.replace(
  /(<loc>https?:\/\/[^<]*\/blog(?:\/[^<\s]*[^/<\s])?)(<\/loc>)/g,
  "$1/$2",
);

fs.writeFileSync(SITEMAP, corrigido);

const total = [...corrigido.matchAll(/<loc>[^<]*\/blog\/[^<]*<\/loc>/g)].length;
const semBarra = [...corrigido.matchAll(/<loc>[^<]*\/blog\/[^<]*[^/]<\/loc>/g)].length;

console.log(`sitemap: ${total} URLs do blog com barra final, ${semBarra} sem`);
if (semBarra > 0) {
  console.error("alguma URL do blog ficou sem a barra final");
  process.exit(1);
}
