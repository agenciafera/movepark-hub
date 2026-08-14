#!/usr/bin/env node
/**
 * Gera os artefatos de leitura por agente (GEO) depois do build, em `dist/`:
 *
 *  - `faq/<slug>.md`   : uma página Markdown por pergunta do FAQ (answer-first),
 *                        servida pelo worker via `Accept: text/markdown`;
 *  - `faq.md`          : índice Markdown da central de FAQ;
 *  - `precos.md`       : índice Markdown do índice de preços (/precos);
 *  - `precos/<slug>.md`: a tabela de preços de cada destino em Markdown, com a
 *                        mesma ordem de blocos da página React;
 *  - `llms-full.txt`   : conteúdo integral do FAQ + preços + destinos + índice
 *                        do blog, inline num arquivo só, pra leitura de ponta a ponta;
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

async function rpc(name, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC ${name}: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// dados
// ---------------------------------------------------------------------------
const [faqs, destinations, posts, priceIndex] = await Promise.all([
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
  rpc("destination_price_index"),
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
// precos.md + precos/<slug>.md — o gêmeo Markdown do índice de preços.
// A ordem de blocos espelha a página React: resposta rápida, tabela, origem.
// ---------------------------------------------------------------------------
const brl = (v) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const durLabel = (d) => (d === 1 ? "1 diária" : `${d} diárias`);
const nomeCurto = (d) => d.short_name ?? d.name;
const unidadesCarro = (dest) =>
  (dest.units ?? []).filter((u) => u.parking_type_code !== "motorcycle");
const totalDe = (u, d) => (u.prices ?? []).find((p) => p.days === d)?.total ?? null;

/** Menor total por duração, com quem pratica. Mesma regra da página. */
function resumoPorDuracao(dest, dias) {
  const out = [];
  for (const d of dias) {
    let melhor = null;
    for (const u of unidadesCarro(dest)) {
      const total = totalDe(u, d);
      if (total != null && (melhor === null || total < melhor.total)) melhor = { u, total };
    }
    if (melhor) out.push({ dias: d, ...melhor });
  }
  return out;
}

function tabelaMarkdown(dest, dias) {
  const linhas = [
    `| Estacionamento | ${dias.map(durLabel).join(" | ")} |`,
    `| --- | ${dias.map(() => "---").join(" | ")} |`,
  ];
  const ordenadas = [...unidadesCarro(dest)].sort((a, b) => {
    const ta = totalDe(a, 7);
    const tb = totalDe(b, 7);
    if (ta != null && tb != null) return ta - tb;
    return ta != null ? -1 : tb != null ? 1 : 0;
  });
  for (const u of ordenadas) {
    const celulas = dias.map((d) => {
      const p = (u.prices ?? []).find((x) => x.days === d);
      if (!p || p.total == null) {
        return u.min_stay_days != null && u.min_stay_days > d
          ? `entrada a partir de ${u.min_stay_days} diárias`
          : "ver na página";
      }
      const balcao =
        p.old_total != null && p.old_total > p.total ? ` (balcão ${brl(p.old_total)})` : "";
      return `${brl(p.total)}${balcao}`;
    });
    linhas.push(`| ${u.company_name} (${u.parking_type_name}) | ${celulas.join(" | ")} |`);
  }
  return linhas;
}

const diasIndice = priceIndex?.days ?? [1, 7, 15, 30];
const destinosComPreco = priceIndex?.destinations ?? [];

fs.mkdirSync(path.join(DIST, "precos"), { recursive: true });

for (const dest of destinosComPreco) {
  const nome = nomeCurto(dest);
  const linhas = [
    "---",
    `title: "Preços de estacionamento em ${nome}: diária, 7, 15 e 30 dias | Movepark"`,
    `canonical: ${SITE_URL}/precos/${dest.slug}`,
    `updated: ${hoje}`,
    "---",
    "",
    `# Preços de estacionamento em ${nome}`,
    "",
    "O valor desta tabela é o mesmo do checkout: sai do motor de preços da Movepark",
    "e muda junto com a tabela de cada parceiro. Balcão é a tarifa de quem chega sem reserva.",
    "",
    "## Resposta rápida",
    "",
  ];
  for (const r of resumoPorDuracao(dest, diasIndice)) {
    const porDia = r.dias > 1 ? `, ${brl(r.total / r.dias)} por diária` : "";
    linhas.push(
      `- ${durLabel(r.dias)}: a partir de ${brl(r.total)} no ${r.u.company_name} (${r.u.parking_type_name}${porDia})`,
    );
  }
  linhas.push("", "## Tabela de preços", "", ...tabelaMarkdown(dest, diasIndice), "");
  linhas.push(
    `Reservar: ${SITE_URL}/destinos/${dest.slug}`,
    `Índice completo: ${SITE_URL}/precos`,
    "",
  );
  fs.writeFileSync(path.join(DIST, "precos", `${dest.slug}.md`), linhas.join("\n"));
}

{
  const linhas = [
    "---",
    'title: "Índice de preços de estacionamento | Movepark"',
    `canonical: ${SITE_URL}/precos`,
    `updated: ${hoje}`,
    "---",
    "",
    "# Índice de preços de estacionamento",
    "",
    "Quanto custa estacionar perto de cada aeroporto e terminal, no preço real de",
    "reserva: diária, 7, 15 e 30 diárias, com o preço de balcão ao lado. Cada destino",
    "tem página própria; a versão Markdown responde no mesmo endereço com o header",
    "`Accept: text/markdown`.",
    "",
  ];
  for (const dest of destinosComPreco) {
    linhas.push(`- [Preços em ${nomeCurto(dest)}](${SITE_URL}/precos/${dest.slug})`);
  }
  linhas.push("", `Conteúdo integral: ${SITE_URL}/llms-full.txt`, "");
  fs.writeFileSync(path.join(DIST, "precos.md"), linhas.join("\n"));
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

  if (destinosComPreco.length > 0) {
    linhas.push("", "## Índice de preços (motor de reservas, valor do checkout)", "");
    for (const dest of destinosComPreco) {
      linhas.push(`### ${nomeCurto(dest)}`, "", `URL: ${SITE_URL}/precos/${dest.slug}`, "");
      for (const r of resumoPorDuracao(dest, diasIndice)) {
        linhas.push(
          `- ${durLabel(r.dias)}: a partir de ${brl(r.total)} no ${r.u.company_name} (${r.u.parking_type_name})`,
        );
      }
      linhas.push(...tabelaMarkdown(dest, diasIndice), "");
    }
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
  `geo-artifacts: ${paginas} páginas de FAQ e ${destinosComPreco.length} de preços em Markdown, ` +
    `faq.md, precos.md, llms-full.txt e data do llms.txt atualizados`,
);
