#!/usr/bin/env node
/**
 * Gera os artefatos de leitura por agente (GEO) depois do build, em `dist/`:
 *
 *  - `faq/<slug>.md`  : uma página Markdown por pergunta do FAQ (answer-first),
 *                        servida pelo worker via `Accept: text/markdown`;
 *  - `faq.md`          : índice Markdown da central de FAQ;
 *  - `llms-full.txt`   : conteúdo integral do FAQ + destinos + índice do blog,
 *                        inline num arquivo só, pra leitura de ponta a ponta;
 *  - `llms.txt`        : refresh da linha "Última atualização" na cópia do dist.
 *
 * Fica fora do vite de propósito: é pós-processamento de conteúdo, igual ao
 * canonicalize-sitemap.mjs, e roda com os mesmos .env (anon key, leitura pública).
 * Falha de rede aborta com exit 1: publicar sem os artefatos seria regredir a
 * superfície GEO em silêncio.
 */

import fs from "node:fs";
import path from "node:path";

const SITE_URL = "https://hub.movepark.co";
const DIST = "dist";

// ---------------------------------------------------------------------------
// env: mesma ordem do vite (process.env > .env.local > .env)
// ---------------------------------------------------------------------------
function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("geo-artifacts: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ausentes.");
  process.exit(1);
}

async function rest(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`REST ${pathAndQuery}: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// dados
// ---------------------------------------------------------------------------
const [faqs, destinations, posts] = await Promise.all([
  rest(
    "faq?select=id,scope,question,answer,slug,body_md,sort_order,updated_at,destination_id," +
      "category:faq_category(slug,label,sort_order)," +
      "destination:destination(name,short_name,slug,code)" +
      "&is_published=eq.true&deleted_at=is.null&scope=in.(global,destination)" +
      "&order=sort_order.asc,created_at.asc",
  ),
  rest(
    "destination?select=name,short_name,slug,code,city,state" +
      "&is_published=eq.true&order=sort_order.asc",
  ),
  rest(
    "blog_post?select=slug,title,published_at" +
      "&is_published=eq.true&deleted_at=is.null&order=published_at.desc",
  ),
]);

const hoje = new Date().toISOString().slice(0, 10);
const globais = faqs.filter((f) => f.scope === "global");
const porDestino = new Map();
for (const f of faqs.filter((f) => f.scope === "destination")) {
  const key = f.destination?.slug ?? "destino";
  if (!porDestino.has(key)) porDestino.set(key, []);
  porDestino.get(key).push(f);
}

const nomeDestino = (f) => f.destination?.short_name ?? f.destination?.name ?? "Destino";
const urlPergunta = (f) => `${SITE_URL}/faq/${f.slug}`;

/** Relacionadas com a mesma afinidade da página React: destino > categoria > globais. */
function relacionadas(atual, max = 4) {
  const pool = faqs.filter((f) => f.slug && f.id !== atual.id);
  const afinidade = (f) => {
    if (atual.destination_id && f.destination_id === atual.destination_id) return 0;
    if (atual.category?.slug && f.category?.slug === atual.category.slug) return 1;
    if (f.scope === "global") return 2;
    return 3;
  };
  return pool
    .sort(
      (a, b) =>
        afinidade(a) - afinidade(b) ||
        a.sort_order - b.sort_order ||
        a.question.localeCompare(b.question, "pt-BR"),
    )
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// faq/<slug>.md
// ---------------------------------------------------------------------------
fs.mkdirSync(path.join(DIST, "faq"), { recursive: true });

let paginas = 0;
for (const f of faqs) {
  if (!f.slug) continue;
  const rel = relacionadas(f);
  const destino = f.scope === "destination" ? nomeDestino(f) : null;

  const linhas = [
    "---",
    `title: "${f.question.replaceAll('"', "'")} | Movepark"`,
    `canonical: ${urlPergunta(f)}`,
    `updated: ${String(f.updated_at).slice(0, 10)}`,
    ...(destino ? [`destino: ${destino}`] : []),
    "---",
    "",
    `# ${f.question}`,
    "",
    "## Resposta rápida",
    "",
    f.answer,
    "",
  ];

  if (f.body_md) linhas.push(f.body_md, "");

  if (rel.length > 0) {
    linhas.push("## Perguntas relacionadas", "");
    for (const r of rel) linhas.push(`- [${r.question}](${urlPergunta(r)})`);
    linhas.push("");
  }

  linhas.push(
    destino && f.destination?.slug
      ? `Estacionamentos em ${destino}: ${SITE_URL}/destinos/${f.destination.slug}`
      : `Buscar estacionamento: ${SITE_URL}/search`,
    `Todas as perguntas: ${SITE_URL}/faq`,
    "",
  );

  fs.writeFileSync(path.join(DIST, "faq", `${f.slug}.md`), linhas.join("\n"));
  paginas += 1;
}

// ---------------------------------------------------------------------------
// faq.md (índice)
// ---------------------------------------------------------------------------
{
  const linhas = [
    "---",
    'title: "Perguntas frequentes | Movepark"',
    `canonical: ${SITE_URL}/faq`,
    `updated: ${hoje}`,
    "---",
    "",
    "# Perguntas frequentes",
    "",
    "Reservas, pagamentos e check-in, com as respostas que o suporte mais repete.",
    "Cada pergunta tem página própria; a versão Markdown responde no mesmo endereço",
    'com o header `Accept: text/markdown`.',
    "",
    "## Perguntas gerais",
    "",
  ];
  for (const f of globais) {
    linhas.push(f.slug ? `- [${f.question}](${urlPergunta(f)})` : `- ${f.question}`);
  }
  for (const [, itens] of [...porDestino.entries()].sort((a, b) =>
    nomeDestino(a[1][0]).localeCompare(nomeDestino(b[1][0]), "pt-BR"),
  )) {
    linhas.push("", `## Sobre ${nomeDestino(itens[0])}`, "");
    for (const f of itens) {
      linhas.push(f.slug ? `- [${f.question}](${urlPergunta(f)})` : `- ${f.question}`);
    }
  }
  linhas.push("", `Conteúdo integral: ${SITE_URL}/llms-full.txt`, "");
  fs.writeFileSync(path.join(DIST, "faq.md"), linhas.join("\n"));
}

// ---------------------------------------------------------------------------
// llms-full.txt
// ---------------------------------------------------------------------------
{
  const linhas = [
    "# Movepark: conteúdo completo",
    "",
    "Este arquivo traz o conteúdo integral da central de FAQ, os destinos cobertos e",
    "o índice do blog do Movepark, inline, para leitura de ponta a ponta por sistemas",
    `de IA. Gerado no build de ${hoje}.`,
    "",
    `Índice do FAQ: ${SITE_URL}/faq`,
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
    "## FAQ: perguntas gerais",
    "",
  ];

  const bloco = (f) => {
    const out = [`### ${f.question}`, ""];
    if (f.slug) out.push(`URL: ${urlPergunta(f)}`, "");
    out.push(f.answer, "");
    if (f.body_md) out.push(f.body_md, "");
    return out;
  };

  for (const f of globais) linhas.push(...bloco(f));

  for (const [, itens] of [...porDestino.entries()].sort((a, b) =>
    nomeDestino(a[1][0]).localeCompare(nomeDestino(b[1][0]), "pt-BR"),
  )) {
    linhas.push(`## FAQ: ${nomeDestino(itens[0])}`, "");
    for (const f of itens) linhas.push(...bloco(f));
  }

  linhas.push("## Destinos com estacionamento", "");
  for (const d of destinations) {
    const cidade = [d.city, d.state].filter(Boolean).join("/");
    linhas.push(
      `- ${d.name}${d.code ? ` (${d.code})` : ""}${cidade ? `, ${cidade}` : ""}: ${SITE_URL}/destinos/${d.slug}`,
    );
  }

  linhas.push("", "## Blog (índice)", "");
  for (const p of posts) {
    linhas.push(`- ${p.title}: ${SITE_URL}/blog/${p.slug}/`);
  }
  linhas.push(
    "",
    'Cada post responde em Markdown puro no mesmo endereço com `Accept: text/markdown`.',
    "",
  );

  fs.writeFileSync(path.join(DIST, "llms-full.txt"), linhas.join("\n"));
}

// ---------------------------------------------------------------------------
// llms.txt: refresh da data na cópia do dist
// ---------------------------------------------------------------------------
{
  const alvo = path.join(DIST, "llms.txt");
  if (fs.existsSync(alvo)) {
    const conteudo = fs
      .readFileSync(alvo, "utf8")
      .replace(/^Última atualização:.*$/m, `Última atualização: ${hoje}`);
    fs.writeFileSync(alvo, conteudo);
  }
}

console.log(
  `geo-artifacts: ${paginas} páginas de FAQ em Markdown, faq.md, llms-full.txt e data do llms.txt atualizados`,
);
