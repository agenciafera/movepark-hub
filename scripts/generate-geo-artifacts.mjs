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

/**
 * Retry com backoff pras leituras: o script aborta o build quando falha (regredir
 * a superfície GEO em silêncio seria pior), então um flake de rede ou um
 * statement_timeout do papel anon no meio do build de deploy não pode ser
 * sentença. Três tentativas espaçadas seguram o caso transiente; o erro
 * persistente continua derrubando o build, que é o combinado.
 */
async function comRetry(rotulo, tenta, tentativas = 3) {
  let ultimo;
  for (let i = 1; i <= tentativas; i += 1) {
    try {
      return await tenta();
    } catch (e) {
      ultimo = e;
      if (i < tentativas) {
        console.warn(`geo-artifacts: ${rotulo} falhou (tentativa ${i}), tentando de novo...`);
        await new Promise((r) => setTimeout(r, i * 2000));
      }
    }
  }
  throw ultimo;
}

async function rest(pathAndQuery) {
  return comRetry(`REST ${pathAndQuery.split("?")[0]}`, async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) throw new Error(`REST ${pathAndQuery}: ${res.status}`);
    return res.json();
  });
}

async function rpc(name, body = {}) {
  return comRetry(`RPC ${name}`, async () => {
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
  });
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
    "destination?select=name,short_name,slug,code,city,state,type,seo_label,intro" +
      "&is_published=eq.true&order=sort_order.asc",
  ),
  rest(
    "blog_post?select=slug,title,published_at" +
      "&is_published=eq.true&deleted_at=is.null&order=published_at.desc",
  ),
  rpc("destination_price_index"),
]);

/**
 * Lotes mapeados por destino (ADR-010), para o gêmeo Markdown listar distância de
 * quem não vende junto de quem vende. Em blocos de 6 porque 27 RPCs simultâneas
 * estouram o statement timeout do papel anon durante o build. Falha de um destino
 * derruba só a lista dele, nunca o artefato inteiro.
 */
const prospectsPorDestino = new Map();
for (let i = 0; i < destinations.length; i += 6) {
  await Promise.all(
    destinations.slice(i, i + 6).map(async (d) => {
      const cards = await rpc("destination_prospect_cards", { p_destination_slug: d.slug }).catch(
        () => [],
      );
      prospectsPorDestino.set(
        d.slug,
        (cards ?? []).map((p) => ({
          name: p.name,
          slug: p.slug,
          distance_km: p.distance_km == null ? null : Number(p.distance_km),
        })),
      );
    }),
  );
}

const hoje = new Date().toISOString().slice(0, 10);
/** A mesma data em pt-BR, para prosa. O ISO fica só no frontmatter. */
const hojeBR = hoje.split("-").reverse().join("/");
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
// faq/<slug>.md — espelha a página React (answer-first + palavra-chave de
// tráfego de aeroporto no título e no primeiro parágrafo + preços + 2 CTAs).
// Fica numa função porque precisa dos helpers de preço declarados mais abaixo;
// a chamada acontece depois deles.
// ---------------------------------------------------------------------------
let paginas = 0;

/** "Guarulhos (GRU)" vira "Guarulhos" (mesma regra de faqPagina.logic.ts). */
const semCodigo = (shortName, name) =>
  (shortName ?? name).replace(/\s*\([^)]*\)\s*$/, "").trim();

const keywordTitulo = (dest) => {
  if (!dest) return "Estacionamento de Aeroporto";
  const curto = semCodigo(dest.short_name, dest.name);
  return dest.name.startsWith("Aeroporto")
    ? `Estacionamento Aeroporto ${curto}`
    : `Estacionamento ${curto}`;
};

const aeroportoProsa = (dest) =>
  dest.name.startsWith("Aeroporto") && dest.name.length <= 28
    ? dest.name
    : `Aeroporto de ${semCodigo(dest.short_name, dest.name)}`;

const CHECKLIST_FAQ = [
  "Vaga coberta ou descoberta: a coberta protege de sol e chuva, a descoberta costuma ter a menor diária.",
  "Traslado até o terminal: confirme se está incluído e de quanto em quanto tempo sai.",
  "Distância e tempo até o embarque: estão na página de cada estacionamento.",
  "Cancelamento e tolerância de horário: a política aparece antes de fechar a reserva.",
];

// Aeroporto sem parceiro precificado: a reserva fecha direto com o estacionamento,
// então o checklist não aponta pra página de oferta da Movepark (mesma regra da
// página React; coerência da página e ADR-009).
const CHECKLIST_FAQ_SEM_PARCEIRO = [
  "Vaga coberta ou descoberta: a coberta protege de sol e chuva, a descoberta costuma ter a menor diária.",
  "Traslado até o terminal: confirme se está incluído e de quanto em quanto tempo sai.",
  "Distância até o terminal: os estacionamentos mapeados estão na página do aeroporto.",
  "Cancelamento e tolerância de horário: confirme a política na cotação, antes de pagar.",
];

function gerarFaqPaginasMd(precoPorSlug, dias) {
  fs.mkdirSync(path.join(DIST, "faq"), { recursive: true });

  for (const f of faqs) {
    if (!f.slug) continue;
    const rel = relacionadas(f);
    const dest = f.scope === "destination" ? f.destination : null;
    // Sem parceiro precificado, a página não promete reserva pela Movepark nem
    // "preços logo abaixo": o fechamento muda de contexto (mesma regra do React).
    // O sinal é a ausência de preço do motor, mesmo que o destino apareça no
    // índice só com lotes mapeados.
    const destPreco = dest ? precoPorSlug.get(dest.slug) : null;
    const resumoPreco = dest && destPreco ? resumoPorDuracao(destPreco, dias) : [];
    const semParceiro = Boolean(dest && resumoPreco.length === 0);
    // Blocos de preço e de fechamento só onde preço é o assunto (mesma regra da
    // página React): nas outras perguntas, o corpo específico sustenta a página.
    const paginaDePreco = f.category?.slug === "pagamentos";
    const keyword = keywordTitulo(dest);
    const fecho = !paginaDePreco
      ? "os detalhes estão logo abaixo"
      : semParceiro
        ? "o comparativo da região está logo abaixo"
        : "preços e o passo a passo estão logo abaixo";
    const intro = dest
      ? `Pergunta comum de quem procura estacionamento no ${aeroportoProsa(dest)} (${dest.code}). A resposta curta vem primeiro; ${fecho}.`
      : "Pergunta comum de quem procura estacionamento de aeroporto com reserva online. A resposta curta vem primeiro; os detalhes estão logo abaixo.";

    const linhas = [
      "---",
      `title: "${f.question.replaceAll('"', "'")} · ${keyword} | Movepark"`,
      `canonical: ${urlPergunta(f)}`,
      `updated: ${String(f.updated_at).slice(0, 10)}`,
      ...(dest ? [`destino: ${nomeDestino(f)}`] : []),
      "---",
      "",
      `# ${f.question}`,
      "",
      intro,
      "",
      "## Resposta rápida",
      "",
      f.answer,
      "",
    ];

    if (f.body_md) linhas.push(f.body_md, "");

    // Quanto custa: mesma tabela compacta da página, com dado do motor.
    if (paginaDePreco && dest && destPreco) {
      const resumo = resumoPreco;
      if (resumo.length > 0) {
        linhas.push(
          `## Quanto custa estacionar no ${aeroportoProsa(dest)}`,
          "",
          "Preços do motor de reservas, os mesmos do checkout. O valor por dia cai conforme a estadia.",
          "",
          "| Período | Total a partir de | Por dia |",
          "| --- | --- | --- |",
        );
        for (const r of resumo) {
          linhas.push(`| ${durLabel(r.dias)} | ${brl(r.total)} | ${brl(r.total / r.dias)}/dia |`);
        }
        linhas.push("", `Tabela completa: ${SITE_URL}/precos/${dest.slug}`, "");
      }
    }

    if (paginaDePreco) {
      if (semParceiro && dest) {
        linhas.push(
          `## Como escolher o estacionamento no ${aeroportoProsa(dest)}`,
          "",
          `Neste aeroporto a reserva é fechada direto com o estacionamento. A página do ${aeroportoProsa(dest)} mapeia os da região, com endereço, telefone e avaliação do Google: cote dois ou três, compare o total do período e confirme o traslado antes de pagar.`,
          "",
        );
      } else {
        linhas.push(
          "## Como reservar com a Movepark",
          "",
          "Você busca pelo aeroporto, compara preço, tipo de vaga e avaliação dos estacionamentos credenciados e reserva online, com o valor fechado antes de pagar. Na maioria das unidades o traslado até o terminal está incluído.",
          "",
        );
      }
      linhas.push(
        "## O que conferir antes de reservar",
        "",
        ...(semParceiro ? CHECKLIST_FAQ_SEM_PARCEIRO : CHECKLIST_FAQ).map((item) => `- ${item}`),
        "",
      );
    }

    if (rel.length > 0) {
      linhas.push("## Perguntas relacionadas", "");
      for (const r of rel) linhas.push(`- [${r.question}](${urlPergunta(r)})`);
      linhas.push("");
    }

    linhas.push(
      dest
        ? semParceiro
          ? `Ver estacionamentos: ${SITE_URL}/destinos/${dest.slug}`
          : `Reservar vaga: ${SITE_URL}/destinos/${dest.slug}`
        : `Buscar estacionamento: ${SITE_URL}/search`,
      dest && !semParceiro
        ? `Comparar preços: ${SITE_URL}/precos/${dest.slug}`
        : `Comparar preços: ${SITE_URL}/precos`,
      `Todas as perguntas: ${SITE_URL}/faq`,
      "",
    );

    fs.writeFileSync(path.join(DIST, "faq", `${f.slug}.md`), linhas.join("\n"));
    paginas += 1;
  }
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

/** "328 m" até 949 m; acima disso km com uma casa. Espelha `formatDistance` do app. */
const fmtDistancia = (m) => {
  if (m == null) return null;
  if (m < 950) return `${m} m`;
  const km = Math.round((m / 1000) * 10) / 10;
  return `${Number.isInteger(km) ? String(km) : km.toFixed(1).replace(".", ",")} km`;
};

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

// As páginas de FAQ em Markdown usam os helpers de preço acima; geradas aqui,
// depois que tudo está declarado.
gerarFaqPaginasMd(new Map(destinosComPreco.map((d) => [d.slug, d])), diasIndice);

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

/**
 * Tabela do índice: top 5 vagas por destino, ordenadas pela diária avulsa,
 * com 7 e 15 dias em R$/dia (mesmo corte editorial da página /precos).
 */
function tabelaTopMarkdown(dest, limit = 5) {
  const unidades = [...unidadesCarro(dest)].sort((a, b) => {
    for (const d of [1, 7, 15]) {
      const ta = totalDe(a, d);
      const tb = totalDe(b, d);
      if (ta != null && tb != null) {
        if (ta !== tb) return ta - tb;
        continue;
      }
      if (ta != null) return -1;
      if (tb != null) return 1;
    }
    return 0;
  });
  const linhas = [
    "| Estacionamento | Diária avulsa | 7 dias (R$/dia) | 15 dias (R$/dia) |",
    "| --- | --- | --- | --- |",
  ];
  for (const u of unidades.slice(0, limit)) {
    const celula = (d) => {
      const total = totalDe(u, d);
      if (total == null) {
        return u.min_stay_days != null && u.min_stay_days > d
          ? `mín. ${u.min_stay_days} diárias`
          : "ver na página";
      }
      return d === 1 ? brl(total) : `${brl(total / d)} (total ${brl(total)})`;
    };
    linhas.push(
      `| ${u.company_name} (${u.parking_type_name}) · [reservar](${SITE_URL}/p/${u.company_slug}/${u.location_slug}/${u.parking_type_code}) | ${celula(1)} | ${celula(7)} | ${celula(15)} |`,
    );
  }
  if (unidades.length > limit) {
    const resto = unidades.length - limit;
    linhas.push("", `Mais ${resto} ${resto === 1 ? "vaga" : "vagas"} na tabela completa.`);
  }
  return linhas;
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
    "Quanto custa estacionar perto de cada aeroporto, no preço real de reserva: uma",
    "tabela por destino, ordenada pela diária mais baixa, com 7 e 15 dias em R$/dia.",
    "Toda linha é um parceiro Movepark com reserva online. A tabela completa de cada",
    "destino (com 30 diárias) vive em /precos/<slug>; a versão Markdown responde no",
    "mesmo endereço com o header `Accept: text/markdown`.",
    "",
  ];
  for (const dest of destinosComPreco) {
    linhas.push(
      `## ${nomeCurto(dest)}`,
      "",
      ...tabelaTopMarkdown(dest),
      "",
      `Tabela completa: ${SITE_URL}/precos/${dest.slug}`,
      "",
    );
  }
  // A página /precos cobre o catálogo inteiro de aeroportos; o gêmeo Markdown
  // fecha a conta listando os que ainda não têm parceiro precificado.
  const comPreco = new Set(destinosComPreco.map((d) => d.slug));
  const semParceiro = destinations.filter((d) => d.type === "airport" && !comPreco.has(d.slug));
  if (semParceiro.length > 0) {
    linhas.push(
      "## Aeroportos ainda sem reserva online",
      "",
      "Nestes aeroportos a Movepark mapeia os estacionamentos da região; a ficha de cada",
      "um (endereço e distância) fica na página do destino, e o preço é a tabela do local.",
      "",
    );
    for (const d of semParceiro) {
      linhas.push(`- ${nomeCurto(d)}: ${SITE_URL}/destinos/${d.slug}`);
    }
    linhas.push("");
  }
  linhas.push(`Conteúdo integral: ${SITE_URL}/llms-full.txt`, "");
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
// destinos/<slug>.md — o gêmeo Markdown da página de destino, a página que
// disputa "estacionamento aeroporto <nome>". Mesma ordem de blocos da React:
// intro, quanto custa, estacionamentos com link, FAQ do destino.
// ---------------------------------------------------------------------------
{
  fs.mkdirSync(path.join(DIST, "destinos"), { recursive: true });
  const precoPorSlugDest = new Map(destinosComPreco.map((d) => [d.slug, d]));

  for (const d of destinations) {
    const rotulo = d.seo_label ?? nomeCurto(d);
    const linhas = [
      "---",
      `title: "Estacionamento ${rotulo} | Movepark"`,
      `canonical: ${SITE_URL}/destinos/${d.slug}`,
      `updated: ${hoje}`,
      "---",
      "",
      `# Estacionamento ${rotulo.replace(/\s*\([^)]*\)\s*$/, "")}`,
      "",
    ];

    if (d.intro) linhas.push(d.intro, "");

    const preco = precoPorSlugDest.get(d.slug);
    const resumo = preco ? resumoPorDuracao(preco, diasIndice) : [];
    if (resumo.length > 0) {
      // Resposta rápida primeiro (uma linha por duração), depois a matriz completa
      // por operadora. O gêmeo espelha a página React, que passou a trazer a matriz
      // em vez de só o "a partir de": resumo sem comparação não sustenta citação.
      linhas.push("## Quanto custa", "");
      for (const r of resumo) {
        linhas.push(
          `- ${durLabel(r.dias)}: a partir de ${brl(r.total)} no ${r.u.company_name} (${r.u.parking_type_name})${r.dias > 1 ? `, ${brl(r.total / r.dias)} por diária` : ""}`,
        );
      }
      linhas.push("", ...tabelaMarkdown(preco, diasIndice), "");
      linhas.push(
        `Preços do motor de reservas da Movepark, conferidos em ${hojeBR}. O valor entre parênteses é o balcão do estacionamento, sem reserva.`,
        "",
        `Tabela completa: ${SITE_URL}/precos/${d.slug}`,
        `Como apuramos: ${SITE_URL}/metodologia`,
        "",
      );
    }

    // Distância medida no banco (PostGIS), a mesma lista da página React. Só quem
    // tem medida entra: distância declarada por estacionamento não vale nada aqui.
    const comDistancia = (preco ? unidadesCarro(preco) : [])
      .filter((u) => u.distance_m != null)
      .reduce((acc, u) => {
        const chave = `${u.company_slug}/${u.location_slug}`;
        if (!acc.has(chave) || acc.get(chave).distance_m > u.distance_m) acc.set(chave, u);
        return acc;
      }, new Map());
    const mapeadosDoDestino = (prospectsPorDestino.get(d.slug) ?? []).filter(
      (p) => p.distance_km != null,
    );
    const ancora = d.type === "airport" || d.type === "bus_terminal" ? " do terminal" : "";
    const linhasDistancia = [
      ...[...comDistancia.values()].map((u) => ({
        metros: u.distance_m,
        texto: `- ${u.company_name}: ${fmtDistancia(u.distance_m)}${ancora} (${SITE_URL}/p/${u.company_slug}/${u.location_slug}/${u.parking_type_code})`,
      })),
      ...mapeadosDoDestino.map((p) => ({
        metros: Math.round(p.distance_km * 1000),
        texto: `- ${p.name}: ${fmtDistancia(Math.round(p.distance_km * 1000))}${ancora}, sem reserva online (${SITE_URL}/estacionamentos/${d.slug}/${p.slug})`,
      })),
    ].sort((a, b) => a.metros - b.metros);
    if (linhasDistancia.length > 0) {
      linhas.push(
        `## Distância até ${d.type === "airport" ? "o terminal" : nomeCurto(d)}`,
        "",
        "Medida a partir das coordenadas de cada endereço, no banco de dados da Movepark.",
        "",
        ...linhasDistancia.map((l) => l.texto),
        "",
      );
    }

    const unidades = preco ? unidadesCarro(preco) : [];
    if (unidades.length > 0) {
      linhas.push("## Estacionamentos com reserva online", "");
      const vistos = new Set();
      for (const u of unidades) {
        const chave = `${u.company_slug}/${u.location_slug}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        linhas.push(
          `- ${u.company_name}: ${SITE_URL}/p/${u.company_slug}/${u.location_slug}/${u.parking_type_code}`,
        );
      }
      linhas.push("");
    }

    const faqsDest = porDestino.get(d.slug) ?? [];
    if (faqsDest.length > 0) {
      linhas.push("## Perguntas frequentes", "");
      for (const f of faqsDest) {
        linhas.push(`### ${f.question}`, "");
        if (f.slug) linhas.push(`URL: ${urlPergunta(f)}`, "");
        linhas.push(f.answer, "");
      }
    }

    linhas.push(
      `Reservar: ${SITE_URL}/search?dest=${encodeURIComponent(d.code)}`,
      `Todos os destinos: ${SITE_URL}/destinos`,
      "",
    );

    fs.writeFileSync(path.join(DIST, "destinos", `${d.slug}.md`), linhas.join("\n"));
  }
}

// ---------------------------------------------------------------------------
// estacionamento-mais-barato/<slug>.md — a intenção "mais barato" em Markdown,
// com vencedor e segunda opção por duração (mesma regra da página React).
// ---------------------------------------------------------------------------
{
  fs.mkdirSync(path.join(DIST, "estacionamento-mais-barato"), { recursive: true });

  for (const dest of destinosComPreco) {
    const nome = nomeCurto(dest).replace(/\s*\([^)]*\)\s*$/, "").trim();
    const linhasTabela = [];
    for (const d of diasIndice) {
      const ordenadas = unidadesCarro(dest)
        .map((u) => ({ u, total: totalDe(u, d) }))
        .filter((x) => x.total != null)
        .sort((a, b) => a.total - b.total);
      if (ordenadas.length === 0) continue;
      const [v, vice] = ordenadas;
      linhasTabela.push(
        `| ${durLabel(d)} | ${v.u.company_name} (${v.u.parking_type_name}) | ${brl(v.total)} (${brl(v.total / d)}/dia) | ${vice ? `${vice.u.company_name}, ${brl(vice.total)}` : "sem segunda opção"} |`,
      );
    }
    if (linhasTabela.length === 0) continue;

    const linhas = [
      "---",
      `title: "Estacionamento mais barato em ${nome} (${dest.code}) | Movepark"`,
      `canonical: ${SITE_URL}/estacionamento-mais-barato/${dest.slug}`,
      `updated: ${hoje}`,
      "---",
      "",
      `# Qual é o estacionamento mais barato perto de ${nome}?`,
      "",
      "Vencedor e segunda opção por duração, com o preço do motor de reservas (o mesmo do checkout). O ranking muda quando a tabela do parceiro muda.",
      "",
      "| Período | Mais barato | Total | Segunda opção |",
      "| --- | --- | --- | --- |",
      ...linhasTabela,
      "",
      `Tabela completa e preço de balcão: ${SITE_URL}/precos/${dest.slug}`,
      `Reservar: ${SITE_URL}/destinos/${dest.slug}`,
      "",
    ];
    fs.writeFileSync(
      path.join(DIST, "estacionamento-mais-barato", `${dest.slug}.md`),
      linhas.join("\n"),
    );
  }
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
