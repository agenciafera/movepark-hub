#!/usr/bin/env node
/**
 * Auditoria de dado estruturado sobre o HTML do build.
 *
 * Existe porque o Search Console avisa TARDE: a página do Aeropark ficou meses publicando um
 * `Product` sem `offers`, `review` nem `aggregateRating`, que é item inválido, e o alerta só
 * chegou quando alguém foi olhar. O erro é detectável no `dist/`, antes do deploy.
 *
 * Roda sobre o HTML pré-renderizado, e não sobre o código, porque é o HTML que o buscador lê:
 * schema montado por um caminho que nenhum teste cobre aparece aqui do mesmo jeito.
 *
 *   bun run lint:schema        (precisa de `bun run build` antes)
 *
 * Sai com código 1 quando há erro. Aviso não reprova: é campo recomendado, não obrigatório.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = "dist";
const erros = [];
const avisos = [];
const tipos = new Map();
let paginas = 0;

function htmls(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return htmls(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

const absoluta = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
const lista = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function visita(no, rota, caminho = "$", pai = null) {
  if (Array.isArray(no)) {
    no.forEach((x, i) => visita(x, rota, `${caminho}[${i}]`, pai));
    return;
  }
  if (!no || typeof no !== "object") return;

  const ts = lista(no["@type"]);
  for (const t of ts) tipos.set(t, (tipos.get(t) ?? 0) + 1);
  const err = (m) => erros.push({ rota, caminho, m });
  const avi = (m) => avisos.push({ rota, caminho, m });

  if (ts.includes("Product")) {
    if (!no.name) err("Product sem name");
    // A regra que motivou o script: Product precisa de UMA das três para ser item válido.
    if (!no.offers && !no.review && !no.aggregateRating) {
      err("Product sem offers, review nem aggregateRating (item inválido)");
    }
    if (no.image == null) avi("Product sem image (recomendado pelo Google)");
    for (const u of lista(no.image)) if (!absoluta(u)) err(`Product.image não absoluta: ${u}`);
  }
  if (ts.includes("Offer")) {
    // Preço zero é erro em oferta de produto, e é o CERTO em coisa declarada gratuita:
    // o schema.org pede `price: "0"` junto de `isAccessibleForFree`, e é assim que o
    // Google espera ver uma WebApplication sem custo. A regra antiga reprovava os dois
    // igual, e derrubou o build do site por 17 horas por causa da calculadora.
    const gratuitoDeclarado = pai?.isAccessibleForFree === true;
    const preco = Number(no.price);
    const invalido = no.price == null || no.price === "" || Number.isNaN(preco)
      ? true
      : gratuitoDeclarado ? preco < 0 : preco <= 0;
    if (invalido) {
      err(
        gratuitoDeclarado
          ? `Offer gratuita com price inválido: ${no.price}`
          : `Offer com price inválido: ${no.price}`,
      );
    }
    if (!no.priceCurrency) err("Offer sem priceCurrency");
  }
  if (ts.includes("AggregateOffer")) {
    if (no.lowPrice == null || no.lowPrice === "" || Number(no.lowPrice) <= 0) {
      err(`AggregateOffer com lowPrice inválido: ${no.lowPrice}`);
    }
    for (const campo of ["lowPrice", "highPrice"]) {
      const v = String(no[campo] ?? "");
      if (v.includes("Infinity") || v.includes("NaN")) err(`${campo} = ${v}`);
    }
    if (!no.priceCurrency) err("AggregateOffer sem priceCurrency");
  }
  if (ts.includes("AggregateRating")) {
    if (no.ratingValue == null) err("AggregateRating sem ratingValue");
    if (no.reviewCount == null && no.ratingCount == null) {
      err("AggregateRating sem reviewCount nem ratingCount");
    }
  }
  if (ts.includes("Review")) {
    if (!no.author) err("Review sem author");
    if (no.reviewRating?.ratingValue == null) err("Review sem reviewRating.ratingValue");
  }
  if (ts.includes("Question")) {
    if (!no.name) err("Question sem name");
    if (!no.acceptedAnswer?.text) err("Question sem acceptedAnswer.text");
  }
  if (ts.includes("FAQPage") && !lista(no.mainEntity).length) err("FAQPage sem mainEntity");
  if (ts.includes("ListItem")) {
    if (no.position == null) err("ListItem sem position");
    if (!no.name && !no.item?.name) err("ListItem sem name");
  }
  if (ts.includes("BreadcrumbList")) {
    const pos = lista(no.itemListElement).map((i) => i?.position);
    const esperado = pos.map((_, i) => i + 1);
    if (pos.join(",") !== esperado.join(",")) {
      err(`BreadcrumbList com positions fora de ordem: ${pos.join(",")}`);
    }
  }
  if (ts.includes("ItemList") && !lista(no.itemListElement).length) err("ItemList sem itemListElement");
  if (["Article", "BlogPosting", "NewsArticle"].some((t) => ts.includes(t))) {
    if (!no.headline) err("Article sem headline");
    else if (String(no.headline).length > 110) {
      avi(`headline com ${String(no.headline).length} chars (Google recomenda até 110)`);
    }
    if (!no.author) err("Article sem author");
    if (!no.datePublished) err("Article sem datePublished");
    for (const u of lista(no.image)) {
      const alvo = typeof u === "object" ? u?.url : u;
      if (!absoluta(alvo)) err(`Article.image não absoluta: ${alvo}`);
    }
  }
  // O que o Search Console cobrou em 20/08/2026 ("Nenhum URL de miniatura enviado"): sem
  // miniatura o Google acha o vídeo, entende que a página tem vídeo e não indexa. Os quatro
  // campos abaixo são os obrigatórios do Google para VideoObject.
  if (ts.includes("VideoObject")) {
    if (!no.name) err("VideoObject sem name");
    if (!no.description) err("VideoObject sem description");
    if (!no.uploadDate) err("VideoObject sem uploadDate");
    if (!lista(no.thumbnailUrl).length) err("VideoObject sem thumbnailUrl");
    if (!no.contentUrl && !no.embedUrl) err("VideoObject sem contentUrl nem embedUrl");
  }
  if (ts.includes("Organization") && !no.name) err("Organization sem name");
  if ((ts.includes("LocalBusiness") || ts.includes("ParkingFacility")) && !no.name) {
    err("LocalBusiness/ParkingFacility sem name");
  }
  // URL relativa o buscador não resolve em JSON-LD, em campo nenhum.
  for (const campo of ["url", "logo", "sameAs", "item", "contentUrl", "thumbnailUrl"]) {
    for (const u of lista(no[campo])) {
      if (typeof u === "string" && u.startsWith("/")) err(`${campo} relativa: ${u}`);
    }
  }
  for (const [k, v] of Object.entries(no)) if (k !== "@type") visita(v, rota, `${caminho}.${k}`, no);
}

for (const f of htmls(RAIZ).sort()) {
  paginas++;
  const rota = "/" + relative(RAIZ, f).replace(/\/index\.html$/, "").replace(/\.html$/, "");
  const html = readFileSync(f, "utf8");
  const blocos = html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  );
  for (const [, bruto] of blocos) {
    try {
      visita(JSON.parse(bruto), rota);
    } catch (e) {
      erros.push({ rota, caminho: "$", m: `JSON-LD inválido: ${e.message}` });
    }
  }
}

const total = [...tipos.values()].reduce((a, b) => a + b, 0);
console.log(`schema: ${paginas} páginas, ${total} nós, ${erros.length} erros, ${avisos.length} avisos`);
for (const { rota, caminho, m } of erros) console.error(`  ERRO  ${rota}\n        ${caminho} :: ${m}`);
const porAviso = new Map();
for (const a of avisos) porAviso.set(a.m, (porAviso.get(a.m) ?? 0) + 1);
for (const [m, n] of [...porAviso].sort((a, b) => b[1] - a[1])) console.log(`  aviso ${n}x ${m}`);

process.exit(erros.length > 0 ? 1 : 0);
