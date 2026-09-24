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
 *  - `precos.json`     : o índice inteiro em JSON datado, para agente consumir sem
 *                        raspar HTML, mais um por destino ao lado do `precos.md`;
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
import { DEFAULT_SITE_URL } from "../src/lib/site-host.mjs";
import { agruparGuiasPorDestino, rebaixarHeadings } from "./llms-indice.mjs";
import { buildPriceIndexJson } from "./price-index-json.mjs";

// Host canônico: mesma fonte do front e do sitemap. Este script escreve o corpus que as IAs
// leem (llms-full.txt, faq/*.md, precos/*.md, destinos/*.md), então host errado aqui é o site
// inteiro se apresentando num endereço que não existe mais.
const SITE_URL = DEFAULT_SITE_URL;

/**
 * Os caminhos do catálogo, na mesma gramática do app (src/lib/urls.ts): o gêmeo Markdown
 * responde no MESMO caminho da página, por negociação de conteúdo no worker.
 * `public_slug` é o slug da URL; `slug` continua sendo a chave antiga do banco.
 */
const pubSlug = (d) => d.public_slug ?? d.slug;
const cDestino = (d) => `/estacionamentos/${pubSlug(d)}`;
const cPrecos = (d) => `${cDestino(d)}/precos`;
const cMaisBarato = (d) => `${cDestino(d)}/mais-barato`;

/** Escreve `dist/estacionamentos/<destino>/<arquivo>`, criando a pasta do destino. */
function escreverNoDestino(dest, arquivo, conteudo) {
  const pasta = path.join(DIST, "estacionamentos", pubSlug(dest));
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, arquivo), conteudo);
}
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
// meta description: a mesma estrutura do site (src/lib/seo.ts)
//
// Palavra-chave na abertura, menor preço real e CTA no fim, dentro de 160
// caracteres. Os artefatos GEO carregam a mesma frase que a página React, senão
// o agente lê uma promessa e o humano lê outra na mesma URL. O arquivo não
// importa `@/lib/seo` porque roda em Node puro, fora do bundle do Vite; o teste
// de contrato `src/seo-meta.contract.test.ts` é quem impede as duas de divergir.
// ---------------------------------------------------------------------------
const META_MAX = 160;

const CTA_META = {
  reservar: "Reserve online em 2 minutos.",
  comparar: "Compare e reserve pela Movepark.",
  consultar: "Veja as opções e como chegar.",
  conferir: "Confira a tabela atualizada.",
};

/** "A partir de R$ 18,49 a diária." Valor ausente ou zero não vira frase. */
function ganchoDePreco(valor, dias = 1) {
  if (valor == null || !Number.isFinite(valor) || valor <= 0) return null;
  return `A partir de ${brl(valor)} ${dias === 1 ? "a diária" : `em ${dias} diárias`}.`;
}

/**
 * Monta a description cabendo em 160. A ordem de descarte protege o que não pode
 * faltar: sai primeiro o complemento, depois o preço; palavra-chave e CTA ficam.
 */
function metaDescricao({ keyword, fill, extra, price, cta }) {
  const fecho = CTA_META[cta];
  const complemento = (extra ?? "").trim().replace(/[.\s]+$/, "") || null;
  const preco = (price ?? "").trim() || null;
  // Espaço que sobra para o `fill` com a frase montada. Sem esta conta o resumo tinha um
  // teto fixo e 161 gêmeos fechavam em 115 caracteres, jogando fora o espaço da SERP.
  const fixo = keyword.length + 2 + 1 + (preco ? preco.length + 1 : 0) + fecho.length + 1;
  const resumo = fill ? resumoCurto(fill, META_MAX - fixo) : null;
  const abertura = resumo && resumo.length >= 40 ? `${keyword}: ${resumo}` : keyword;
  const montar = (comExtra, comPreco) =>
    [
      `${abertura}${comExtra && complemento ? `, ${complemento}` : ""}.`,
      comPreco && preco ? preco : null,
      fecho,
    ]
      .filter(Boolean)
      .join(" ");
  for (const [e, pr] of [
    [true, true],
    [false, true],
    [true, false],
    [false, false],
  ]) {
    const texto = montar(e, pr);
    if (texto.length <= META_MAX) return texto;
  }
  return `${keyword}.`.slice(0, META_MAX).trim();
}

/** As primeiras `max` letras de um texto, fechando em palavra inteira e sem pontuação solta. */
function resumoCurto(texto, max) {
  const limpo = String(texto ?? "")
    .replace(/[#*_`>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (limpo.length <= max) return limpo.replace(/[.,;:]$/, "");
  const corte = limpo.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > 0 ? corte.slice(0, espaco) : corte).replace(/[.,;:]$/, "");
}

/** Escapa aspas para o valor caber numa linha de front matter. */
const fm = (texto) => `"${String(texto).replaceAll('"', "'")}"`;

/**
 * A palavra-chave do destino na forma em que a pessoa digita. Espelha
 * `destinationKeyword` de `src/lib/seo.ts`: o "Aeroporto" entra na frente quando o
 * rótulo do banco não o traz, porque é o bigrama que responde pelos cliques.
 */
const keywordDestino = (dest) => {
  const rotulo = (dest.short_name ?? dest.name).trim();
  const jaNomeado = /^(aeroporto|rodovi|terminal|centro|jardim|bairro)/i.test(rotulo);
  return !jaNomeado && dest.type === "airport"
    ? `Estacionamento Aeroporto ${rotulo}`
    : `Estacionamento ${rotulo}`;
};

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
    "destination?select=id,name,short_name,slug,public_slug,code,city,state,type,seo_label,intro" +
      "&is_published=eq.true&order=sort_order.asc",
  ),
  rest(
    "blog_post?select=slug,title,published_at,ai_summary,excerpt,meta_description,body_md,destination_id" +
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
          name: p.public_name ?? p.name,
          slug: p.public_slug ?? p.slug,
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

/**
 * Mesmo par `artigo()` + `seoLabelPrimary()` de `src/lib/seo.ts`: sem o código entre
 * parênteses e sem a variante depois da vírgula. O gêmeo markdown tem que repetir o H2
 * da página React palavra por palavra, senão a página e a citação de IA respondem a
 * mesma pergunta com títulos diferentes.
 */
const rotuloPrimario = (dest) =>
  semCodigo(dest.seo_label ?? dest.short_name, dest.name).split(",")[0].trim();
const artigoDestino = (dest) => (dest.type === "bus_terminal" ? "a" : "o");

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

    const diaria1 = resumoPreco.find((r) => r.dias === 1) ?? resumoPreco[0] ?? null;
    const linhas = [
      "---",
      `title: "${f.question.replaceAll('"', "'")} · ${keyword} | Movepark"`,
      `description: ${fm(
        metaDescricao({
          keyword,
          fill: f.answer,
          price: diaria1 ? ganchoDePreco(diaria1.total, diaria1.dias) : null,
          cta: diaria1 ? "comparar" : "conferir",
        }),
      )}`,
      `canonical: ${urlPergunta(f)}`,
      `updated: ${String(f.updated_at).slice(0, 10)}`,
      ...(dest ? [`destino: ${nomeDestino(f)}`] : []),
      `tags: [${["faq", f.category?.slug, dest ? dest.code : "geral"].filter(Boolean).join(", ")}]`,
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
          `## Quanto custa estacionar por período no ${aeroportoProsa(dest)}?`,
          "",
          "Preços do motor de reservas, os mesmos do checkout. O valor por dia cai conforme a estadia.",
          "",
          "| Período | Total a partir de | Por dia |",
          "| --- | --- | --- |",
        );
        for (const r of resumo) {
          linhas.push(`| ${durLabel(r.dias)} | ${brl(r.total)} | ${brl(r.total / r.dias)}/dia |`);
        }
        linhas.push("", `Tabela completa: ${SITE_URL}${cPrecos(dest)}`, "");
      }
    }

    if (paginaDePreco) {
      if (semParceiro && dest) {
        linhas.push(
          `## Como escolher o estacionamento no ${aeroportoProsa(dest)}?`,
          "",
          `Neste aeroporto a reserva é fechada direto com o estacionamento. A página do ${aeroportoProsa(dest)} mapeia os da região, com endereço, telefone e avaliação do Google: cote dois ou três, compare o total do período e confirme o traslado antes de pagar.`,
          "",
        );
      } else {
        linhas.push(
          "## Como reservar com a Movepark?",
          "",
          "Você busca pelo aeroporto, compara preço, tipo de vaga e avaliação dos estacionamentos credenciados e reserva online, com o valor fechado antes de pagar. Na maioria das unidades o traslado até o terminal está incluído.",
          "",
        );
      }
      linhas.push(
        "## O que conferir antes de reservar?",
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
          ? `Ver estacionamentos: ${SITE_URL}${cDestino(dest)}`
          : `Reservar vaga: ${SITE_URL}${cDestino(dest)}`
        : `Buscar estacionamento: ${SITE_URL}/search`,
      dest && !semParceiro
        ? `Comparar preços: ${SITE_URL}${cPrecos(dest)}`
        : `Comparar preços: ${SITE_URL}/precos`,
      `Todas as perguntas: ${SITE_URL}/faq`,
      "",
    );

    fs.writeFileSync(path.join(DIST, "faq", `${f.slug}.md`), linhas.join("\n"));
    paginas += 1;
  }
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

/**
 * A menor diária do site inteiro. É o número que abre os índices (llms.txt, faq.md,
 * precos.md): o mesmo `overallStats().minDailyFrom` que a página /precos mostra, e é o que
 * dá à description do índice um número para brigar na SERP.
 */
const menorDiariaDoSite = (() => {
  let menor = null;
  for (const dest of destinosComPreco) {
    for (const u of unidadesCarro(dest)) {
      const total = totalDe(u, 1);
      if (total != null && (menor === null || total < menor)) menor = total;
    }
  }
  return menor;
})();

// O índice do FAQ vive aqui, e não junto das páginas de pergunta, porque a description dele
// abre com a menor diária do site: antes de `menorDiariaDoSite` existir, o bloco lia uma
// const na zona morta e o build abortava com ReferenceError.
// ---------------------------------------------------------------------------
// faq.md (índice)
// ---------------------------------------------------------------------------
{
  const linhas = [
    "---",
    'title: "Perguntas frequentes: estacionamento de aeroporto | Movepark"',
    `description: ${fm(
      metaDescricao({
        keyword: "Perguntas frequentes de estacionamento de aeroporto",
        extra: "reserva, pagamento, check-in, cancelamento",
        price: ganchoDePreco(menorDiariaDoSite),
        cta: "comparar",
      }),
    )}`,
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

/**
 * Os achados citáveis do índice, sempre com a mesma redação (o mesmo número
 * repetido do mesmo jeito é o que a IA aprende a citar): menor diária da rede,
 * tamanho do comparativo e a maior economia contra o balcão.
 */
function achadosDoIndice() {
  let menorDiaria = null;
  let unidades = new Set();
  let maiorEco = null;
  let destinosPrecificados = 0;
  for (const dest of destinosComPreco) {
    const carros = unidadesCarro(dest);
    let temPreco = false;
    for (const u of carros) {
      unidades.add(`${u.company_slug}/${u.location_slug}`);
      for (const p of u.prices ?? []) {
        if (p.total == null) continue;
        temPreco = true;
        const diaria = p.total / p.days;
        if (menorDiaria === null || diaria < menorDiaria) menorDiaria = diaria;
        if (p.old_total != null && p.old_total > p.total) {
          const eco = Math.round((1 - p.total / p.old_total) * 100);
          if (maiorEco === null || eco > maiorEco) maiorEco = eco;
        }
      }
    }
    if (temPreco) destinosPrecificados += 1;
  }
  if (menorDiaria === null) return [];
  const linhas = [
    `Menor diária da rede: a partir de ${brl(menorDiaria)} por dia.`,
    `${unidades.size} estacionamentos comparados em ${destinosPrecificados} aeroportos, com o preço do motor de reservas.`,
  ];
  if (maiorEco !== null && maiorEco > 0) {
    linhas.push(`Reservar online economiza até ${maiorEco}% contra o preço de balcão.`);
  }
  linhas.push('Dados livres para citação com atribuição: "Índice Movepark de Preços (movepark.co)".');
  return linhas;
}
const ACHADOS = achadosDoIndice();
const blocoAchados = ACHADOS.length
  ? ["## Números do índice", "", ...ACHADOS.map((a) => `- ${a}`), ""]
  : [];

// As páginas de FAQ em Markdown usam os helpers de preço acima; geradas aqui,
// depois que tudo está declarado.
gerarFaqPaginasMd(new Map(destinosComPreco.map((d) => [d.slug, d])), diasIndice);



for (const dest of destinosComPreco) {
  const nome = nomeCurto(dest);
  const linhas = [
    "---",
    `title: "${keywordDestino(dest)}: preços | Movepark"`,
    `description: ${fm(
      metaDescricao({
        keyword: `${keywordDestino(dest)}: quanto custa`,
        extra: (() => {
          const n = new Set(unidadesCarro(dest).map((u) => u.company_slug)).size;
          return `${n} ${n === 1 ? "parceiro" : "parceiros"} e preço de balcão`;
        })(),
        price: (() => {
          const r = resumoPorDuracao(dest, diasIndice);
          const menor = r.find((x) => x.dias === 1) ?? r[0];
          return menor ? ganchoDePreco(menor.total, menor.dias) : null;
        })(),
        cta: "comparar",
      }),
    )}`,
    `canonical: ${SITE_URL}${cPrecos(dest)}`,
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
    `Reservar: ${SITE_URL}${cDestino(dest)}`,
    `Índice completo: ${SITE_URL}/precos`,
    "",
  );
  escreverNoDestino(dest, "precos.md", linhas.join("\n"));
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
      `| ${u.company_name} (${u.parking_type_name}) · [reservar](${SITE_URL}${u.public_path ?? ""}) | ${celula(1)} | ${celula(7)} | ${celula(15)} |`,
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
    'title: "Preço de estacionamento de aeroporto por diária | Movepark"',
    `description: ${fm(
      metaDescricao({
        keyword: "Preço de estacionamento de aeroporto em tabela",
        extra: `${destinosComPreco.length} aeroportos com reserva online`,
        price: ganchoDePreco(menorDiariaDoSite),
        cta: "comparar",
      }),
    )}`,
    `canonical: ${SITE_URL}/precos`,
    `updated: ${hoje}`,
    "---",
    "",
    "# Índice de preços de estacionamento",
    "",
    "Quanto custa estacionar perto de cada aeroporto, no preço real de reserva: uma",
    "tabela por destino, ordenada pela diária mais baixa, com 7 e 15 dias em R$/dia.",
    "Toda linha é um parceiro Movepark com reserva online. A tabela completa de cada",
    "destino (com 30 diárias) vive em /estacionamentos/<destino>/precos; o Markdown responde no",
    "mesmo endereço com o header `Accept: text/markdown`.",
    "",
  ];
  for (const dest of destinosComPreco) {
    linhas.push(
      `## ${nomeCurto(dest)}`,
      "",
      ...tabelaTopMarkdown(dest),
      "",
      `Tabela completa: ${SITE_URL}${cPrecos(dest)}`,
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
      linhas.push(`- ${nomeCurto(d)}: ${SITE_URL}${cDestino(d)}`);
    }
    linhas.push("");
  }
  linhas.push(`Conteúdo integral: ${SITE_URL}/llms-full.txt`, "");
  fs.writeFileSync(path.join(DIST, "precos.md"), linhas.join("\n"));
}

// ---------------------------------------------------------------------------
// precos.json + estacionamentos/<destino>/precos.json: o índice pronto para
// agente ler, sem raspar HTML e sem chave de API.
//
// Asset estático em vez de rota da Public API, e isso é decisão registrada, não
// atalho: o gateway exige `Authorization: Bearer mp_*` em toda rota, e quem
// procuramos aqui (crawler de IA, agente que leu o llms.txt) não tem chave. O
// mesmo retrato do build que alimenta a página e o gêmeo Markdown alimenta o
// JSON, então os três nunca divergem. Ver docs/specs/indice-precos.md.
// ---------------------------------------------------------------------------
{
  // Uma marca de tempo para todos os arquivos deste build: dois números com datas
  // diferentes no mesmo retrato seria o oposto do que o índice promete.
  const geradoEm = new Date().toISOString();
  const comum = {
    priceIndex,
    destinations,
    siteUrl: SITE_URL,
    generatedAt: geradoEm,
    urlDestino: cDestino,
    urlPrecos: cPrecos,
  };

  fs.writeFileSync(
    path.join(DIST, "precos.json"),
    `${JSON.stringify(buildPriceIndexJson(comum), null, 2)}\n`,
  );

  for (const dest of destinosComPreco) {
    const payload = buildPriceIndexJson({ ...comum, scope: pubSlug(dest) });
    escreverNoDestino(dest, "precos.json", `${JSON.stringify(payload, null, 2)}\n`);
  }
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
    ...(ACHADOS.length ? [...ACHADOS.map((a) => `- ${a}`), ""] : []),
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
    // A pergunta é `###` aqui, então o corpo (escrito para a página, onde abre em `##`)
    // desce dois níveis. Sem isso o arquivo tinha 263 `###` para 212 perguntas e o corpo
    // de uma resposta abria seção no mesmo nível de "## FAQ: perguntas gerais".
    if (f.body_md) out.push(rebaixarHeadings(f.body_md, 2), "");
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
      `- ${d.name}${d.code ? ` (${d.code})` : ""}${cidade ? `, ${cidade}` : ""}: ${SITE_URL}${cDestino(d)}`,
    );
  }

  if (destinosComPreco.length > 0) {
    linhas.push("", "## Índice de preços (motor de reservas, valor do checkout)", "");
    for (const dest of destinosComPreco) {
      linhas.push(`### ${nomeCurto(dest)}`, "", `URL: ${SITE_URL}${cPrecos(dest)}`, "");
      // O R$/dia sai junto, igual ao `precos.md` de cada destino. Sem ele o arquivo publicava
      // só o total da faixa, e a diária mais barata do parceiro (a que decide a comparação na
      // resposta de uma IA) ficava de fora: o Virapark aparecia com os R$ 40,00 da primeira
      // diária, nunca com os R$ 24,90 que ele pratica da sétima em diante.
      for (const r of resumoPorDuracao(dest, diasIndice)) {
        const porDia = r.dias > 1 ? `, ${brl(r.total / r.dias)} por diária` : "";
        linhas.push(
          `- ${durLabel(r.dias)}: a partir de ${brl(r.total)} no ${r.u.company_name} (${r.u.parking_type_name}${porDia})`,
        );
      }
      linhas.push(...tabelaMarkdown(dest, diasIndice), "");
    }
  }

  linhas.push("", "## Blog (índice)", "");
  for (const p of posts) {
    // A frase do post entra junto do título: índice de títulos soltos obriga o agente a abrir
    // 86 URLs para descobrir qual responde a pergunta dele. Com a description ao lado, ele
    // escolhe na lista, e é a mesma frase que a SERP mostra.
    const resumo = (p.meta_description ?? p.ai_summary ?? p.excerpt ?? "")
      .replace(/\s+/g, " ")
      .trim();
    linhas.push(`- ${p.title}: ${SITE_URL}/blog/${p.slug}/`);
    if (resumo) linhas.push(`  ${resumo}`);
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
  fs.mkdirSync(path.join(DIST, "estacionamentos"), { recursive: true });
  const precoPorSlugDest = new Map(destinosComPreco.map((d) => [d.slug, d]));

  for (const d of destinations) {
    const rotulo = d.seo_label ?? nomeCurto(d);
    const linhas = [
      "---",
      `title: "Estacionamento ${rotulo} | Movepark"`,
      `description: ${fm(
        metaDescricao({
          keyword: `Estacionamento ${rotulo.replace(/\s*\([^)]*\)\s*$/, "")}`,
          // A prova de quantidade entra sempre que sobra espaço, inclusive no destino sem
          // preço: sem ela o gêmeo dos aeroportos só com lote mapeado fechava em 73
          // caracteres e jogava fora metade do que a SERP mostra.
          extra: (() => {
            const cidade = [d.city, d.state].filter(Boolean).join("/") || null;
            const m = (prospectsPorDestino.get(d.slug) ?? []).length;
            const mapeados = m > 0 ? `${m} ${m === 1 ? "estacionamento mapeado" : "estacionamentos mapeados"}` : null;
            return [cidade, mapeados].filter(Boolean).join(", ") || null;
          })(),
          price: (() => {
            const dp = precoPorSlugDest.get(d.slug);
            const r = dp ? resumoPorDuracao(dp, diasIndice) : [];
            const menor = r.find((x) => x.dias === 1) ?? r[0];
            return menor ? ganchoDePreco(menor.total, menor.dias) : null;
          })(),
          cta: precoPorSlugDest.get(d.slug) ? "comparar" : "consultar",
        }),
      )}`,
      `canonical: ${SITE_URL}${cDestino(d)}`,
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
      linhas.push(`## Quanto custa estacionar n${artigoDestino(d)} ${rotuloPrimario(d)}?`, "");
      for (const r of resumo) {
        linhas.push(
          `- ${durLabel(r.dias)}: a partir de ${brl(r.total)} no ${r.u.company_name} (${r.u.parking_type_name})${r.dias > 1 ? `, ${brl(r.total / r.dias)} por diária` : ""}`,
        );
      }
      linhas.push("", ...tabelaMarkdown(preco, diasIndice), "");
      linhas.push(
        `Preços do motor de reservas da Movepark, conferidos em ${hojeBR}. O valor entre parênteses é o balcão do estacionamento, sem reserva.`,
        "",
        `Tabela completa: ${SITE_URL}${cPrecos(d)}`,
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
      `Todos os destinos: ${SITE_URL}/estacionamentos`,
      "",
    );

    linhas.push(...blocoAchados);
    fs.writeFileSync(path.join(DIST, "estacionamentos", `${pubSlug(d)}.md`), linhas.join("\n"));
  }
}

// ---------------------------------------------------------------------------
// estacionamentos/<destino>/mais-barato.md: a intenção "mais barato" em Markdown,
// com vencedor e segunda opção por duração (mesma regra da página React).
// ---------------------------------------------------------------------------
{


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
      `description: ${fm(
        metaDescricao({
          keyword: `Estacionamento mais barato em ${nome} (${dest.code})`,
          extra: "vencedor e segunda opção por duração",
          price: (() => {
            const r = resumoPorDuracao(dest, diasIndice);
            const menor = r.find((x) => x.dias === 1) ?? r[0];
            return menor ? ganchoDePreco(menor.total, menor.dias) : null;
          })(),
          cta: "comparar",
        }),
      )}`,
      `canonical: ${SITE_URL}${cMaisBarato(dest)}`,
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
      `Tabela completa e preço de balcão: ${SITE_URL}${cPrecos(dest)}`,
      `Reservar: ${SITE_URL}${cDestino(dest)}`,
      "",
    ];

    const mapeadosMd = prospectsPorDestino.get(dest.slug) ?? [];
    if (mapeadosMd.length > 0) {
      linhas.push(
        "## E os outros estacionamentos da região?",
        "",
        "O comparativo acima cobre os estacionamentos com reserva online pela Movepark. Estes são os demais lotes mapeados na região, incluindo o oficial do aeroporto quando existe; a ficha traz endereço, mapa e a nota do Google, e o preço se confirma na cotação com o próprio estacionamento.",
        "",
        ...mapeadosMd.map((m) => `- [${m.name}](${SITE_URL}${cDestino(dest)}/${m.slug})`),
        "",
      );
    }
    linhas.push(...blocoAchados);
    escreverNoDestino(dest, "mais-barato.md", linhas.join("\n"));
  }
}

// ---------------------------------------------------------------------------
// estacionamentos/<destino>/<lote>.md: o gêmeo Markdown da página da unidade.
// Sem ele, Accept: text/markdown numa unidade cai no llms.txt genérico.
//
// Ele nascia em `p/<company>/<location>/<type>.md`, que era a URL da ficha ANTES da migração
// para `/estacionamentos/<destino>/<lote>`. O arquivo continuou sendo escrito, mas no endereço
// que ninguém mais pede: o worker procura o `.md` do caminho pedido, não achava, e devolvia o
// llms.txt com 200. Na prática, um agente que buscasse a ficha do Virapark em Markdown recebia
// o índice do site inteiro, sem os R$ 24,90 por diária que são o piso da tabela dele.
//
// O arquivo agora é UM POR UNIDADE, não por tipo de vaga, porque a URL também é: a ficha mostra
// coberta, descoberta e valet na mesma página (`?vaga=` escolhe a que fica em evidência, sem
// criar outra página). Cada tipo vira uma tabela dentro do mesmo gêmeo.
// ---------------------------------------------------------------------------
/** So codigo IATA de verdade merece parenteses; slug de terminal nao e codigo. */
const comCodigo = (dest, nome) => (/^[A-Z]{3}$/.test(dest.code ?? "") ? `${nome} (${dest.code})` : nome);

let unidadesMd = 0;
for (const dest of destinosComPreco) {
  const nome = nomeCurto(dest).replace(/\s*\([^)]*\)\s*$/, "").trim();

  // Agrupa por `public_path`, que é o caminho real da ficha (o mesmo que o índice de preços
  // usa no botão Reservar). Unidade sem caminho público fica de fora: escrever num palpite de
  // rota recria exatamente o bug que este bloco conserta.
  const porFicha = new Map();
  for (const u of unidadesCarro(dest)) {
    if (!u.public_path) continue;
    const atual = porFicha.get(u.public_path) ?? [];
    atual.push(u);
    porFicha.set(u.public_path, atual);
  }

  for (const [caminho, tipos] of porFicha) {
    const corpo = [];
    for (const u of tipos) {
      const tabela = [];
      for (const d of diasIndice) {
        const total = totalDe(u, d);
        if (total == null) continue;
        tabela.push(`| ${durLabel(d)} | ${brl(total)} | ${brl(total / d)}/dia |`);
      }
      if (tabela.length === 0) continue;
      corpo.push(
        `## ${u.parking_type_name}`,
        "",
        "| Período | Total | Por dia |",
        "| --- | --- | --- |",
        ...tabela,
        "",
      );
    }
    if (corpo.length === 0) continue;

    const primeira = tipos[0];
    const urlPagina = `${SITE_URL}${caminho}`;
    const distancia = primeira.distance_m != null ? ` a ${fmtDistancia(primeira.distance_m)} do terminal` : "";
    const linhas = [
      "---",
      `title: "${primeira.company_name} perto de ${comCodigo(dest, nome)}: preço por diária | Movepark"`,
      `description: ${fm(
        metaDescricao({
          keyword: `${keywordDestino(dest)}: ${primeira.company_name}`,
          extra: fmtDistancia(primeira.distance_m)
            ? `a ${fmtDistancia(primeira.distance_m)} do terminal`
            : null,
          // A diária avulsa primeiro; sem ela (estadia mínima), a menor duração que a
          // unidade cota. Unidade com piso de 2 diárias ia para o índice sem número nenhum.
          price: (() => {
            const cotada = diasIndice.map((d) => ({ d, t: totalDe(primeira, d) })).find((x) => x.t != null);
            return cotada ? ganchoDePreco(cotada.t, cotada.d) : null;
          })(),
          cta: primeira.checkout_mode === "hub" ? "reservar" : "comparar",
        }),
      )}`,
      `canonical: ${urlPagina}`,
      `updated: ${hoje}`,
      "---",
      "",
      `# ${primeira.company_name}: quanto custa perto de ${nome}`,
      "",
      `O ${primeira.company_name} é um estacionamento perto de ${comCodigo(dest, nome)}${distancia}, com reserva online pela Movepark. Preços do motor de reservas, os mesmos do checkout. A coluna "Por dia" mostra a diária de cada faixa de duração, e é onde está o menor valor da tabela:`,
      "",
      ...corpo,
      `Reservar ou ver a página completa (fotos, traslado, avaliações): ${urlPagina}`,
      `Comparar com os outros estacionamentos da região: ${SITE_URL}${cPrecos(dest)}`,
      `Todos os estacionamentos em ${nome}: ${SITE_URL}${cDestino(dest)}`,
      "",
    ];
    const destino = path.join(DIST, caminho.replace(/^\/+/, ""));
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(`${destino}.md`, linhas.join("\n"));
    unidadesMd += 1;
  }
}

// ---------------------------------------------------------------------------
// estacionamentos/<destino>/<lote>.md — gêmeo do lote mapeado (ADR-010: sem
// preço por ausência de dado, e o texto diz isso com todas as letras).
// ---------------------------------------------------------------------------
let lotesMd = 0;
for (const d of destinations) {
  const cards = prospectsPorDestino.get(d.slug) ?? [];
  if (cards.length === 0) continue;
  const nome = (d.short_name ?? d.name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  for (const m of cards) {
    // `pubSlug`, não `d.slug`: o slug do banco e o da URL divergem em alguns destinos
    // (`aeroporto-de-viracopos` contra `aeroporto-viracopos`), e o gêmeo escrito no slug do
    // banco ficava num caminho que ninguém pede, caindo no llms.txt igual ao da unidade.
    const urlFicha = `${SITE_URL}${cDestino(d)}/${m.slug}`;
    const distancia = m.distance_km != null ? ` a ${m.distance_km.toFixed(1).replace(".", ",")} km` : "";
    const linhas = [
      "---",
      `title: "${m.name} perto de ${nome} | Movepark"`,
      `description: ${fm(
        metaDescricao({
          keyword: `${m.name}, perto de ${comCodigo(d, nome)}`,
          extra:
            m.distance_km != null
              ? `a ${fmtDistancia(Math.round(m.distance_km * 1000))} do terminal`
              : null,
          price: null,
          cta: "consultar",
        }),
      )}`,
      `canonical: ${urlFicha}`,
      `updated: ${hoje}`,
      "---",
      "",
      `# ${m.name}`,
      "",
      `O ${m.name} é um estacionamento mapeado pela Movepark perto de ${nome}${distancia}. Ele ainda não vende reserva online por aqui, então o preço se confirma na cotação com o próprio estacionamento; a ficha traz endereço, mapa e a nota do Google.`,
      "",
      `Ficha completa: ${urlFicha}`,
      `Estacionamentos com reserva online e preço na hora em ${nome}: ${SITE_URL}${cDestino(d)}`,
      "",
    ];
    const dir = path.join(DIST, "estacionamentos", pubSlug(d));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${m.slug}.md`), linhas.join("\n"));
    lotesMd += 1;
  }
}

// ---------------------------------------------------------------------------
// blog/<slug>.md: o gêmeo Markdown de cada post publicado.
//
// Passou a ser GERADO em 31/08/2026. Antes eram arquivos versionados em
// `public/blog/`, escritos uma vez pelo import do WordPress, e o resultado foi drift:
// o post de Confins teve o arquivo corrigido à mão e o `body_md` não, então o gêmeo
// dizia uma coisa e a página (que renderiza do banco) dizia outra. Pior, o teste de
// contrato lia o ARQUIVO, então ficou verde enquanto a página citava o host antigo.
//
// Gerando do banco, gêmeo e página não conseguem divergir, e os 35 links absolutos para
// `/destinos/<slug legado>` que moravam nesses arquivos deixam de existir por construção:
// o cabeçalho é montado aqui, com `public_slug`.
// ---------------------------------------------------------------------------
{
  const destinoPorId = new Map(destinations.map((d) => [d.id, d]));
  /*
    Data da tabela de preço por destino, do mesmo índice que alimenta /precos. O gêmeo é o que
    a IA lê, e frescor é o critério de desempate quando duas fontes publicam o mesmo número:
    sem o carimbo aqui, o dado datado ficava só no HTML.
  */
  const precoEmPorDestino = new Map(
    destinosComPreco.map((d) => [
      d.slug,
      (d.units ?? [])
        .map((u) => u.price_updated_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    ]),
  );
  fs.mkdirSync(path.join(DIST, "blog"), { recursive: true });

  for (const p of posts) {
    const dest = p.destination_id ? destinoPorId.get(p.destination_id) : null;
    // A `meta_description` vem primeiro: é a frase revisada, na estrutura do site
    // (palavra-chave, menor preço, CTA), e é a mesma que a SERP mostra. O `ai_summary` e o
    // `excerpt` continuam como plano B para post que ainda não tem a frase escrita.
    const resumo = (p.meta_description ?? p.ai_summary ?? p.excerpt ?? "").trim();
    const linhas = [`# ${p.title}`, ""];
    if (resumo) linhas.push(`> ${resumo}`, "");
    linhas.push(`- Publicado em: ${String(p.published_at).slice(0, 10)}`);
    linhas.push(`- URL: ${SITE_URL}/blog/${p.slug}/`);
    // Só no post que publica preço: num guia sem tabela, a data dataria o que a página não diz.
    const precoEm = dest ? precoEmPorDestino.get(dest.slug) : null;
    if (precoEm && /R\$\s?\d/.test(p.body_md ?? "")) {
      linhas.push(`- Preços conferidos no motor de reservas em: ${String(precoEm).slice(0, 10)}`);
    }
    // Só quando o destino tem página no ar: Portugal tem parceiro e `is_published = false`,
    // e apontar para lá seria anunciar endereço que o build não gera.
    if (dest) linhas.push(`- Estacionamentos deste aeroporto: ${SITE_URL}${cDestino(dest)}`);
    linhas.push("", "---", (p.body_md ?? "").trim(), "");
    fs.writeFileSync(path.join(DIST, "blog", `${p.slug}.md`), linhas.join("\n"));
  }

  // O corpus que a IA lê não pode citar o host que aposentamos. A checagem mora aqui, e
  // não num teste de arquivo, porque a fonte agora é o banco: um `body_md` com o host
  // antigo reprova o build em vez de sair publicado em silêncio.
  const comHostAntigo = posts
    .filter((p) => /hub\.movepark\.co|movepark\.com\.br/.test(p.body_md ?? ""))
    .map((p) => p.slug);
  if (comHostAntigo.length > 0) {
    console.error(
      `geo-artifacts: ${comHostAntigo.length} post com host antigo no body_md: ` +
        comHostAntigo.join(", ") +
        ". Corrija no banco: o gêmeo Markdown e a página saem os dois daí.",
    );
    process.exit(1);
  }

  console.log(`geo-artifacts: ${posts.length} gêmeos Markdown de post gerados do banco`);
}

// ---------------------------------------------------------------------------
// blog/feed.xml — RSS 2.0 dos posts publicados. Descoberta de conteúdo por
// agregador e por agente, com o mesmo contrato de URL do blog (com barra).
// ---------------------------------------------------------------------------
{
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const items = posts.slice(0, 50).map((p) => {
    const link = `${SITE_URL}/blog/${p.slug}/`;
    const descricao = p.ai_summary ? `\n      <description>${esc(p.ai_summary)}</description>` : "";
    return `    <item>\n      <title>${esc(p.title)}</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>${descricao}\n    </item>`;
  });
  const rss = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>Blog da Movepark</title>`,
    `    <link>${SITE_URL}/blog/</link>`,
    `    <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />`,
    `    <description>Guias de estacionamento de aeroporto: preços, comparativos e como reservar com antecedência.</description>`,
    `    <language>pt-BR</language>`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    ...items,
    `  </channel>`,
    `</rss>`,
    ``,
  ];
  fs.mkdirSync(path.join(DIST, "blog"), { recursive: true });
  fs.writeFileSync(path.join(DIST, "blog", "feed.xml"), rss.join("\n"));
}

// ---------------------------------------------------------------------------
// llms.txt: refresh da data e o BLOCO POR AEROPORTO.
//
// Antes daqui saía só uma linha por aeroporto com a menor diária, e apontando
// para `/precos/<slug>`, que virou redirecionamento depois da migração de URL.
// A auditoria de 08/09/2026 mediu o custo: o nosso llms.txt tinha 5,9 KB e 9
// seções contra 16 KB e 16 seções do comparador concorrente, que quebra por
// aeroporto com operadoras e FAQ de cada praça. Um agente que lê o nosso saía
// sem saber quem opera onde.
//
// Agora cada aeroporto com parceiro precificado ganha uma subseção com as
// unidades (preço por duração, distância medida e o que a diária inclui), os
// lotes mapeados e as perguntas do destino com a URL de cada uma. Tudo sai do
// mesmo dado da página, então não existe versão do llms.txt divergindo do site.
// ---------------------------------------------------------------------------
{
  const alvo = path.join(DIST, "llms.txt");
  if (fs.existsSync(alvo)) {
    const linhaUnidade = (u) => {
      const partes = [];
      const dia1 = totalDe(u, 1);
      if (dia1 != null) partes.push(`${brl(dia1)} a diária`);
      for (const d of [7, 30]) {
        const t = totalDe(u, d);
        if (t != null) partes.push(`${brl(t)} em ${d} diárias (${brl(t / d)}/dia)`);
      }
      const dist = fmtDistancia(u.distance_m);
      const onde = dist ? `, a ${dist} do terminal` : "";
      const url = u.public_path ? ` ${SITE_URL}${u.public_path}` : "";
      return `  - ${u.company_name}, ${u.parking_type_name.toLowerCase()}${onde}: ${partes.join("; ")}.${url}`;
    };

    const secoes = [];
    for (const dest of destinosComPreco) {
      const meta = destinations.find((d) => d.slug === dest.slug);
      if (!meta) continue;
      const nome = nomeCurto(dest).replace(/\s*\([^)]*\)\s*$/, "").trim();
      const unidades = unidadesCarro(dest);
      if (unidades.length === 0) continue;
      const base = `${SITE_URL}/estacionamentos/${pubSlug(meta)}`;

      const bloco = [`### ${comCodigo(dest, nome)}${meta.city ? `, ${meta.city}` : ""}${meta.state ? ` (${meta.state})` : ""}`, ""];
      // A frase de abertura da praça segue a mesma estrutura das páginas: palavra-chave,
      // menor preço real e CTA. Sem ela o agente tinha que somar a tabela inteira para
      // responder "quanto custa no mínimo".
      const resumoDaPraca = resumoPorDuracao(dest, diasIndice);
      const menorDaPraca = resumoDaPraca.find((r) => r.dias === 1) ?? resumoDaPraca[0] ?? null;
      bloco.push(
        metaDescricao({
          keyword: `${keywordDestino(dest)}: quanto custa`,
          extra: `${unidades.length} ${unidades.length === 1 ? "vaga de parceiro" : "vagas de parceiro"}`,
          price: menorDaPraca ? ganchoDePreco(menorDaPraca.total, menorDaPraca.dias) : null,
          cta: "comparar",
        }),
        "",
      );
      bloco.push(`Página: ${base}`, `Tabela de preços: ${base}/precos`, "");
      bloco.push("Com reserva online pela Movepark:");
      for (const u of unidades) bloco.push(linhaUnidade(u));

      const mapeados = (prospectsPorDestino.get(dest.slug) ?? []).filter((p) => p.distance_km != null);
      if (mapeados.length > 0) {
        bloco.push("", "Mapeados, sem reserva online pela Movepark:");
        for (const p of mapeados.slice(0, 10)) {
          bloco.push(`  - ${p.name}, a ${fmtDistancia(Math.round(p.distance_km * 1000))} do terminal: ${base}/${p.slug}`);
        }
      }

      const perguntas = (porDestino.get(dest.slug) ?? []).filter((q) => q.slug);
      if (perguntas.length > 0) {
        bloco.push("", "Perguntas respondidas nesta praça:");
        for (const q of perguntas) bloco.push(`  - ${q.question} ${urlPergunta(q)}`);
      }
      bloco.push("");
      secoes.push(bloco.join("\n"));
    }

    const abertura =
      menorDiariaDoSite == null
        ? "Sem diária cotada no momento deste retrato."
        : `Menor diária do site em ${hojeBR}: ${brl(menorDiariaDoSite)}. Compare e reserve em ${SITE_URL}/precos`;
    const bloco = [
      `## Aeroportos e operadoras (em ${hojeBR})`,
      "",
      abertura,
      "",
      ...secoes,
    ].join("\n");
    let conteudo = fs
      .readFileSync(alvo, "utf8")
      .replace(/^Última atualização:.*$/m, `Última atualização: ${hoje}`);
    // Remove a versão antiga do bloco (uma linha por aeroporto) quando existir,
    // para o arquivo não acumular as duas gerações.
    conteudo = conteudo.replace(/## Menor diária por aeroporto[\s\S]*?(?=^## )/m, "");
    conteudo = conteudo.replace(/## Aeroportos e operadoras[\s\S]*?(?=^## )/m, "");
    conteudo = conteudo.replace(/^## Como funciona$/m, `${bloco}\n## Como funciona`);

    // --- Blog: os guias enumerados, por aeroporto --------------------------
    //
    // A seção era um ponteiro: prometia "todos os posts publicados" e entregava o link da
    // paginação. Quem lê só o llms.txt (32 KB contra 311 KB do llms-full.txt, e é o que o
    // crawler de IA costuma abrir) não descobria que existem 87 guias. Agora cada um sai
    // aqui, com a mesma frase que a SERP mostra, agrupado pela praça que ele responde.
    const linhaPost = (p) => {
      const resumo = resumoCurto(p.meta_description ?? p.ai_summary ?? p.excerpt ?? "", 200);
      return [`- ${p.title}: ${SITE_URL}/blog/${p.slug}/`, ...(resumo ? [`  ${resumo}`] : [])];
    };
    const gruposBlog = agruparGuiasPorDestino(posts, destinations).map(({ titulo, posts: itens }) =>
      [
        `### ${titulo}: ${itens.length} ${itens.length === 1 ? "guia" : "guias"}`,
        "",
        ...itens.flatMap(linhaPost),
        "",
      ].join("\n"),
    );

    const enumerados = gruposBlog.reduce((n, g) => n + (g.match(/^- /gm) ?? []).length, 0);
    if (enumerados !== posts.length) {
      console.error(
        `geo-artifacts: o llms.txt enumerou ${enumerados} de ${posts.length} posts publicados. ` +
          "O arquivo que a IA lê como índice do corpus não pode sair com post faltando.",
      );
      process.exit(1);
    }

    const secaoBlog = /^## Blog$[\s\S]*?(?=^## )/m;
    if (!secaoBlog.test(conteudo)) {
      console.error(
        "geo-artifacts: não achei a seção `## Blog` no llms.txt para pendurar a lista de guias. " +
          "Se a seção mudou de nome, atualize a âncora aqui em vez de publicar o índice sem os posts.",
      );
      process.exit(1);
    }
    conteudo = conteudo.replace(secaoBlog, (trecho) => {
      // Tira a safra anterior para o arquivo não acumular duas gerações quando o gerador
      // roda duas vezes sobre o mesmo dist.
      const manual = trecho.replace(/\nTodos os guias publicados, por aeroporto:[\s\S]*$/, "\n");
      return `${manual.trimEnd()}\n\nTodos os guias publicados, por aeroporto:\n\n${gruposBlog.join("\n")}\n`;
    });

    fs.writeFileSync(alvo, conteudo);
  }
}

console.log(
  `geo-artifacts: ${paginas} páginas de FAQ, ${destinosComPreco.length} de preços, ` +
    `${unidadesMd} de unidade e ${lotesMd} de lote mapeado em Markdown, ` +
    `faq.md, precos.md, llms-full.txt, blog/feed.xml e llms.txt (data, bloco por aeroporto e ${posts.length} guias) atualizados`,
);
