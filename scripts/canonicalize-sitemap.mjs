#!/usr/bin/env node
/**
 * Pós-processa o `dist/sitemap.xml` em duas frentes:
 *
 * 1. Repõe a barra final nas URLs do blog. O `vite-plugin-sitemap` normaliza
 *    todo path removendo a barra, e não tem opção para desligar. Para o blog a
 *    canônica é `/blog/<slug>/`, herdada do WordPress, e é ela que responde 200
 *    (ver `blogRedirect` em src/worker.ts). Sem a correção o sitemap anunciaria
 *    como canônica exatamente a forma que redireciona (301).
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
  "/operator",
  "/account",
  "/bookings",
  "/checkout",
  "/voucher",
  "/onboarding",
  "/motor-preview",
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

// Só as URLs do blog, e só quando ainda não terminam em barra.
let corrigido = original.replace(
  /(<loc>https?:\/\/[^<]*\/blog(?:\/[^<\s]*[^/<\s])?)(<\/loc>)/g,
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

const total = [...corrigido.matchAll(/<loc>[^<]*\/blog\/[^<]*<\/loc>/g)].length;
const semBarra = [...corrigido.matchAll(/<loc>[^<]*\/blog\/[^<]*[^/]<\/loc>/g)].length;

console.log(`sitemap: ${total} URLs do blog com barra final, ${semBarra} sem`);
if (semBarra > 0) {
  console.error("alguma URL do blog ficou sem a barra final");
  process.exit(1);
}
