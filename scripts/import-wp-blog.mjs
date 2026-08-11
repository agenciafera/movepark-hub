#!/usr/bin/env node
/**
 * Importa os posts do blog WordPress (movepark.co/blog/) para a tabela `blog_post`.
 *
 * O slug vem idêntico do WordPress: ele é o contrato de URL que preserva as 93
 * páginas indexadas. Ver docs/specs/blog.md.
 *
 * Uso:
 *   node scripts/import-wp-blog.mjs --dry-run          # relatório, não escreve nada
 *   node scripts/import-wp-blog.mjs --out /tmp/x.sql   # gera o SQL de upsert
 *   node scripts/import-wp-blog.mjs --images           # baixa e otimiza as imagens
 *   node scripts/import-wp-blog.mjs --reuse-storage    # reaponta para o bucket
 *
 * É idempotente: o upsert usa `legacy_wp_id` como chave, então rodar de novo
 * atualiza em vez de duplicar.
 *
 * Imagens: com `SUPABASE_SERVICE_ROLE_KEY` no ambiente vão para o bucket
 * `assets-public` sob `blog/<slug>/`; sem ela caem em `public/images/blog/`.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";

const WP = "https://movepark.co/wp-json/wp/v2";
const IMAGE_DIR = "public/images/blog";
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 82;

/**
 * Destino das imagens.
 *
 * Com `SUPABASE_SERVICE_ROLE_KEY` no ambiente, sobem para o bucket `assets-public`
 * sob `blog/<slug>/`, que é a convenção do projeto (docs/specs/storage-buckets.md)
 * e o que dá resize sob demanda pelo endpoint de render do Supabase.
 *
 * Sem a chave, caem em `public/images/blog/` e são servidas pelo Cloudflare Pages.
 * O `optimizedImageUrl` do front aceita os dois: URL do Storage ganha transform,
 * caminho local passa direto.
 */
const PROJECT_URL = "https://mgaigbezdalbyuqiofcf.supabase.co";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? PROJECT_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_STORAGE = !!(SUPABASE_URL && SERVICE_ROLE_KEY);
const BUCKET = "assets-public";

/**
 * Categoria do WordPress → slug do destino no Hub.
 *
 * `null` é resposta legítima: Navegantes ainda não existe como destino, e
 * `dica-de-viagem`/`duvidas` não são aeroporto. Post sem destino renderiza sem
 * CTA de unidade, e passa a ter assim que o destino for criado.
 */
const CATEGORY_TO_DESTINATION = {
  "aeroporto-guarulhos": "aeroporto-internacional-de-sao-paulo-guarulhos",
  "aeroporto-viracopos": "aeroporto-de-viracopos",
  "aeroporto-afonso-pena": "aeroporto-afonso-pena",
  "aeroporto-lisboa": "aeroporto-humberto-delgado",
  "aeroporto-confins": "aeroporto-de-confins",
  "aeroporto-congonhas": "aeroporto-de-congonhas",
  "aeroporto-navegantes": null,
  "dica-de-viagem": null,
  duvidas: null,
  "rio-de-janeiro": null,
  uncategorized: null,
};

const args = process.argv.slice(2);
/** Reaponta para o objeto que já está no bucket, em vez de baixar e subir de novo. */
const REUSE_STORAGE = args.includes("--reuse-storage");
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
});

// <figure><img><figcaption> vira imagem + legenda em itálico, sem o wrapper.
turndown.addRule("figure", {
  filter: "figure",
  replacement: (content) => `\n\n${content.trim()}\n\n`,
});
turndown.addRule("figcaption", {
  filter: "figcaption",
  replacement: (content) => (content.trim() ? `\n_${content.trim()}_\n` : ""),
});
// Blocos de script/estilo que o editor clássico deixou para trás.
turndown.addRule("drop", {
  filter: ["script", "style", "noscript", "iframe"],
  replacement: () => "",
});

/**
 * Tabela vira tabela em pipe.
 *
 * Sem esta regra o turndown descarta o `<table>` e derrama as células como
 * parágrafos soltos: 32 dos 93 posts têm comparativo de preço, traslado e
 * diferencial, e todos viravam uma coluna alternando número e título.
 */
turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const linhas = Array.from(node.querySelectorAll("tr"));
    if (!linhas.length) return "";

    const celulasDe = (tr) =>
      Array.from(tr.querySelectorAll("th, td")).map((td) =>
        // O pipe é o separador da sintaxe, então o que vier no texto precisa escapar.
        turndown.turndown(td.innerHTML).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim(),
      );

    const matriz = linhas.map(celulasDe).filter((l) => l.length);
    if (!matriz.length) return "";

    const colunas = Math.max(...matriz.map((l) => l.length));
    const completa = (l) => [...l, ...Array(colunas - l.length).fill("")];
    const emLinha = (l) => `| ${completa(l).join(" | ")} |`;

    const [cabecalho, ...corpo] = matriz;
    const separador = `|${" --- |".repeat(colunas)}`;
    return `\n\n${[emLinha(cabecalho), separador, ...corpo.map(emLinha)].join("\n")}\n\n`;
  },
});

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return res.json();
}

async function fetchAllPosts() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await fetchJson(
      `${WP}/posts?per_page=100&page=${page}&status=publish&_embed=1`,
    );
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/** Remove os comentários de bloco e os wrappers que o WordPress injeta. */
function cleanHtml(html) {
  return (
    html
      .replace(/<!--\s*\/?wp:[^>]*-->/g, "")
      .replace(/<!--\s*more\s*-->/g, "")
      .replace(/\s(class|id|style|data-[\w-]+|srcset|sizes|loading|decoding)="[^"]*"/g, "")
      .replace(/<p>(\s|&nbsp;)*<\/p>/g, "")
      // Imagem presa dentro de <p> ou <hN> vira "## ![alt](src)" ou imagem no meio
      // de um parágrafo, e nos dois casos o render a transforma em texto solto.
      // Hoisting: a imagem sai como irmã do bloco; se o bloco ficar vazio, some.
      .replace(/<(p|h[1-6])>([\s\S]*?)<\/\1>/gi, (match, tag, inner) => {
        const images = inner.match(/<img[^>]*>/gi);
        if (!images) return match;
        const rest = inner.replace(/<img[^>]*>/gi, "").replace(/<a[^>]*>\s*<\/a>/gi, "");
        const kept = rest.replace(/<[^>]*>/g, "").trim() ? `<${tag}>${rest}</${tag}>` : "";
        return `${images.join("")}${kept}`;
      })
      // Alt com quebra de linha quebra a sintaxe "![alt](src)" em duas linhas.
      .replace(/\salt="([^"]*)"/g, (_m, alt) => ` alt="${alt.replace(/\s+/g, " ").trim()}"`)
  );
}

/**
 * Para onde vai cada caminho do site antigo.
 *
 * Levantado dos 93 posts: são 15 caminhos distintos apontando para o WordPress,
 * e todos morrem no corte de domínio. Página de unidade não tem par de URL no
 * Hub (lá é uma URL por tipo de vaga), então ela aponta para o destino, que é a
 * página que lista aquele aeroporto e converte.
 */
const LEGACY_PATH_TO_HUB = {
  "/": "/",
  "/blog": "/blog/",
  "/estacionamentos": "/destinos",
  "/estacionamento/nation-park-aeroporto-afonso-pena": "/destinos/aeroporto-afonso-pena",
  "/estacionamento/garage-inn-aeroporto-viracopos": "/destinos/aeroporto-de-viracopos",
  "/estacionamento/virapark-estacionamento-viracopos": "/destinos/aeroporto-de-viracopos",
  "/virapark/vaga-avulsa": "/destinos/aeroporto-de-viracopos",
  "/pt/estacionamentos/lisboa": "/destinos/aeroporto-humberto-delgado",
  "/pt/estacionamentos/lisboa/airpark": "/destinos/aeroporto-humberto-delgado",
  "/pt/estacionamento/airpark": "/destinos/aeroporto-humberto-delgado",
  "/o-sistema": "/como-funciona",
  // Posts que moraram na raiz antes do prefixo /blog/.
  "/aeroporto-guarulhos/como-encontrar-o-melhor-estacionamento-no-aeroporto-de-guarulhos":
    "/blog/como-encontrar-o-melhor-estacionamento-no-aeroporto-de-guarulhos/",
  "/aeroporto-guarulhos/conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023":
    "/blog/conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023/",
  "/aeroporto-guarulhos/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes":
    "/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/",
  // Post renomeado: ponce-park virou aeropark.
  "/blog/ponce-park-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas":
    "/blog/aeropark-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas/",
};

/**
 * Slug de aeroporto no legado → slug do destino no Hub.
 *
 * O legado tinha `/estacionamentos/<aeroporto>` e
 * `/estacionamentos/<aeroporto>/<lote>`. O Hub não tem página por lote, então os
 * dois níveis caem no destino, que é onde o leitor escolhe a vaga.
 */
const LEGACY_AIRPORT_TO_DESTINATION = {
  "aeroporto-viracopos": "aeroporto-de-viracopos",
  campinas: "aeroporto-de-viracopos",
  "aeroporto-afonso-pena": "aeroporto-afonso-pena",
  "aeroporto-congonhas": "aeroporto-de-congonhas",
  cgh: "aeroporto-de-congonhas",
  "aeroporto-guarulhos": "aeroporto-internacional-de-sao-paulo-guarulhos",
  guarulhos: "aeroporto-internacional-de-sao-paulo-guarulhos",
  "aeroporto-confins": "aeroporto-de-confins",
  "aeroporto-santos-dumont-rio": "aeroporto-santos-dumont",
  "aeroporto-rio-galeao": "aeroporto-do-galeao",
  "aeroporto-brasilia": "aeroporto-de-brasilia",
  "aeroporto-salgado-filho": "aeroporto-salgado-filho",
  "afonso-pena": "aeroporto-afonso-pena",
  "terminal-rodoviario-tiete": "terminal-rodoviario-tiete",
  lisboa: "aeroporto-humberto-delgado",
};

/** Subdomínio de parceiro → destino do Hub onde aquele lote é vendido hoje. */
const LEGACY_HOST_TO_HUB = {
  "poncepark.movepark.co": "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos",
};

/** True para qualquer host da casa antiga, incluindo subdomínio de parceiro. */
function ehDominioAntigo(host) {
  return /(^|\.)movepark\.(co|com\.br)$/.test(host);
}

/**
 * Reescreve os links do corpo para rotas do Hub.
 *
 * O que não tem par vira texto puro, sem link: um link para um domínio que sai
 * do ar é pior que nenhum link, porque o leitor clica e cai num 404.
 */
function rewriteLinks(md, report) {
  // O `(?<!!)` é o que separa link de imagem: sem ele o `![alt](src)` casa aqui
  // e a imagem vira texto. Foi assim que 81 imagens quase sumiram do acervo.
  // O terceiro grupo é o title opcional (`(url "texto")`), que o editor clássico
  // deixou em alguns links. Sem ele no padrão, esses links passavam batido.
  return md.replace(/(?<!!)\[([^\]]*)\]\(([^)\s]*)(\s+"[^"]*")?\)/g, (inteiro, rotulo, href, t) => {
    const title = t ?? "";
    if (!href) {
      report.linksRemovidos++;
      return rotulo;
    }
    if (!/^https?:\/\//.test(href)) return inteiro;

    let url;
    try {
      url = new URL(href);
    } catch {
      report.linksRemovidos++;
      return rotulo;
    }
    if (!ehDominioAntigo(url.hostname)) return inteiro;

    const caminho = url.pathname.replace(/\/+$/, "") || "/";

    // Post do blog no mesmo lugar: o slug é o mesmo dos dois lados.
    if (caminho.startsWith("/blog/") && !LEGACY_PATH_TO_HUB[caminho]) {
      report.linksReescritos++;
      return `[${rotulo}](${caminho}/${title})`;
    }

    const direto = LEGACY_PATH_TO_HUB[caminho];
    if (direto) {
      report.linksReescritos++;
      return `[${rotulo}](${direto}${title})`;
    }

    // `/estacionamentos/<aeroporto>` e `/estacionamentos/<aeroporto>/<lote>`.
    const aeroporto = caminho.match(/^\/estacionamentos\/([^/]+)/)?.[1];
    const destino = aeroporto && LEGACY_AIRPORT_TO_DESTINATION[aeroporto];
    if (destino) {
      report.linksReescritos++;
      return `[${rotulo}](/destinos/${destino}${title})`;
    }

    // Subdomínio de parceiro: o lote continua existindo, só que dentro do Hub.
    const porHost = LEGACY_HOST_TO_HUB[url.hostname];
    if (porHost) {
      report.linksReescritos++;
      return `[${rotulo}](${porHost}${title})`;
    }

    // Sobrou: fica o texto, sem link. Melhor que mandar o leitor para um 404.
    report.linksRemovidos++;
    return rotulo;
  });
}

/**
 * Alt a partir do nome do arquivo, quando o WordPress não deixou nenhum.
 *
 * Os nomes são descritivos ("estacionamento-aeroporto-viracopos.webp"), então
 * viram uma legenda honesta. Melhor que alt vazio numa imagem de conteúdo.
 */
function altDoArquivo(src) {
  const base = (src.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  const texto = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!texto || /^\d+$/.test(texto)) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Preenche o alt vazio de `![](src)` a partir do nome do arquivo. */
function preencheAlt(md, report) {
  return md.replace(/!\[\s*\]\(([^)\s]+)([^)]*)\)/g, (inteiro, src, resto) => {
    const alt = altDoArquivo(src);
    if (!alt) return inteiro;
    report.altPreenchidos++;
    return `![${alt}](${src}${resto})`;
  });
}

/**
 * Tira bloco repetido em sequência.
 *
 * O editor clássico duplicou parágrafo em 6 posts, quase sempre por copiar e
 * colar durante a edição. Ler a mesma frase duas vezes seguidas parece defeito
 * de render, então some na importação.
 */
function removeRepetidos(md, report) {
  const vistos = new Set();
  const saida = [];
  for (const b of md.split(/\n{2,}/)) {
    const chave = b.trim();
    // O limite de 40 protege bloco curto legítimo: "Reserve agora" repetido ao
    // longo do texto é CTA, não descuido de edição.
    if (chave.length > 40 && vistos.has(chave)) {
      report.blocosRepetidos++;
      continue;
    }
    if (chave.length > 40) vistos.add(chave);
    saida.push(b);
  }
  return saida.join("\n\n");
}

function slugifyFile(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Baixa uma imagem do WordPress, converte para WebP e devolve o caminho público.
 *
 * Imagem hospedada fora do movepark.co é descartada: são thumbnails hotlinkadas
 * do Bing que já vinham quebrando e carregam risco de direito autoral.
 */
async function migrateImage(url, postSlug, report) {
  if (!url.includes("movepark.co")) {
    report.externalDropped.push(url);
    return null;
  }
  const base = slugifyFile(decodeURIComponent(url.split("/").pop().split("?")[0]));
  const webpName = base.replace(/\.[a-z0-9]+$/i, "") + ".webp";

  // Reimportação de conteúdo: as imagens já subiram numa rodada anterior e o
  // nome no bucket é determinístico, então dá para reapontar sem service key.
  // O HEAD é o que impede inventar URL: só aponta para objeto que existe mesmo.
  if (REUSE_STORAGE) {
    const remote = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/blog/${postSlug}/${webpName}`;
    if ((await fetch(remote, { method: "HEAD" })).ok) {
      report.imagesReused++;
      return remote;
    }
    report.imagesFailed.push(url);
    return null;
  }

  const destDir = path.join(IMAGE_DIR, postSlug);
  const destPath = path.join(destDir, webpName);
  const publicPath = `/images/blog/${postSlug}/${webpName}`;

  // Arquivo já convertido numa rodada anterior. Com o Storage ligado ele ainda
  // precisa subir: é justamente este o caminho da migração de local para bucket,
  // e sem isto o atalho pularia as 131 imagens que já estão no disco.
  if (fs.existsSync(destPath)) {
    if (USE_STORAGE) {
      const remote = await uploadToStorage(destPath, `blog/${postSlug}/${webpName}`, report);
      if (remote) {
        fs.rmSync(destPath, { force: true });
        return remote;
      }
      return null;
    }
    report.imagesSkipped++;
    return publicPath;
  }

  const res = await fetch(url);
  if (!res.ok) {
    report.imagesFailed.push(url);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(destDir, { recursive: true });
  const tmp = path.join(destDir, `.tmp-${base}`);
  fs.writeFileSync(tmp, buf);
  try {
    execFileSync(
      "cwebp",
      ["-quiet", "-q", String(WEBP_QUALITY), "-resize", String(MAX_WIDTH), "0", tmp, "-o", destPath],
      { stdio: "pipe" },
    );
    report.imagesBefore += buf.length;
    report.imagesAfter += fs.statSync(destPath).size;
    report.imagesConverted++;

    if (USE_STORAGE) {
      const remote = await uploadToStorage(destPath, `blog/${postSlug}/${webpName}`, report);
      if (remote) {
        // O arquivo local era só o estágio da conversão; a fonte passa a ser o bucket.
        fs.rmSync(destPath, { force: true });
        return remote;
      }
      return null;
    }

    return publicPath;
  } catch {
    report.imagesFailed.push(url);
    return null;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Sobe um arquivo para `assets-public` e devolve a URL pública.
 *
 * `upsert` ligado para o script continuar idempotente: rodar de novo sobrescreve
 * em vez de estourar por conflito.
 */
async function uploadToStorage(localPath, objectPath, report) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}?upsert=true`,
    {
      method: "POST",
      headers: {
        // O gateway do Supabase exige `apikey` além do bearer. Com service_role o
        // bearer sozinho passa, então a falta só aparece quando a chave é outra.
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "image/webp",
        "x-upsert": "true",
      },
      body: fs.readFileSync(localPath),
    },
  );

  if (!res.ok) {
    report.uploadsFailed.push(`${objectPath}: HTTP ${res.status} ${await res.text()}`);
    return null;
  }
  report.uploaded++;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

function sqlString(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replaceAll("'", "''")}'`;
}

async function main() {
  const dryRun = flag("dry-run");
  const doImages = flag("images");
  const outPath = opt("out", null);

  const report = {
    posts: 0,
    withDestination: 0,
    withoutDestination: [],
    withMetaTitle: 0,
    withMetaDescription: 0,
    imagesConverted: 0,
    imagesReused: 0,
    imagesSkipped: 0,
    imagesFailed: [],
    externalDropped: [],
    imagesBefore: 0,
    imagesAfter: 0,
    markdownWritten: 0,
    linksReescritos: 0,
    linksRemovidos: 0,
    altPreenchidos: 0,
    blocosRepetidos: 0,
    uploaded: 0,
    uploadsFailed: [],
  };

  const [posts, categories] = await Promise.all([fetchAllPosts(), fetchJson(`${WP}/categories?per_page=100`)]);
  const catById = new Map(categories.map((c) => [c.id, c.slug]));

  const rows = [];
  for (const post of posts) {
    const slug = post.slug;
    const catSlug = catById.get(post.categories?.[0]) ?? null;
    const destinationSlug = catSlug ? (CATEGORY_TO_DESTINATION[catSlug] ?? null) : null;

    let html = cleanHtml(post.content?.rendered ?? "");

    if (doImages) {
      const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
      for (const src of new Set(srcs)) {
        const decoded = src.replaceAll("&amp;", "&");
        const migrated = await migrateImage(decoded, slug, report);
        if (migrated) html = html.replaceAll(src, migrated);
        else html = html.replace(new RegExp(`<img[^>]+src="${src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`, "g"), "");
      }
    }

    let bodyMd = turndown.turndown(html);
    bodyMd = rewriteLinks(bodyMd, report);
    bodyMd = preencheAlt(bodyMd, report);
    bodyMd = removeRepetidos(bodyMd, report);
    bodyMd = bodyMd.replace(/\n{3,}/g, "\n\n").trim();

    const media = post._embedded?.["wp:featuredmedia"]?.[0];
    let cover = media?.source_url ?? null;
    if (doImages && cover) cover = await migrateImage(cover, slug, report);

    const yoast = post.yoast_head_json ?? {};
    const metaTitle = yoast.title && yoast.title !== post.title?.rendered ? yoast.title : null;
    const metaDescription = yoast.description ?? null;

    if (metaTitle) report.withMetaTitle++;
    if (metaDescription) report.withMetaDescription++;
    if (destinationSlug) report.withDestination++;
    else report.withoutDestination.push(`${slug} (categoria: ${catSlug ?? "nenhuma"})`);
    report.posts++;

    rows.push({
      slug,
      title: decodeEntities(post.title?.rendered ?? ""),
      excerpt: stripTags(post.excerpt?.rendered ?? "") || null,
      body_md: bodyMd,
      cover_image_url: cover,
      meta_title: metaTitle ? decodeEntities(metaTitle) : null,
      meta_description: metaDescription ? decodeEntities(metaDescription) : null,
      destination_slug: destinationSlug,
      author_name: post._embedded?.author?.[0]?.name ?? null,
      published_at: post.date_gmt ? `${post.date_gmt}Z` : new Date().toISOString(),
      legacy_wp_id: post.id,
      legacy_url: post.link,
    });
  }

  if (outPath) {
    fs.writeFileSync(outPath, buildSql(rows));
    console.log(`SQL escrito em ${outPath} (${rows.length} posts)`);
  }

  const jsonPath = opt("json", null);
  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify(rows));
    console.log(`JSON escrito em ${jsonPath} (${rows.length} posts)`);
  }

  if (flag("markdown")) writeMarkdown(rows, report);

  printReport(report, dryRun);
  return rows;
}

function buildSql(rows) {
  const values = rows
    .map(
      (r) => `(
  ${sqlString(r.slug)}, ${sqlString(r.title)}, ${sqlString(r.excerpt)}, ${sqlString(r.body_md)},
  ${sqlString(r.cover_image_url)}, ${sqlString(r.meta_title)}, ${sqlString(r.meta_description)},
  ${r.destination_slug ? `(select id from public.destination where slug = ${sqlString(r.destination_slug)})` : "null"},
  ${sqlString(r.author_name)}, ${sqlString(r.published_at)}::timestamptz, true,
  ${r.legacy_wp_id}, ${sqlString(r.legacy_url)}
)`,
    )
    .join(",\n");

  return `-- Gerado por scripts/import-wp-blog.mjs. Idempotente: upsert por legacy_wp_id.
insert into public.blog_post (
  slug, title, excerpt, body_md, cover_image_url, meta_title, meta_description,
  destination_id, author_name, published_at, is_published, legacy_wp_id, legacy_url
) values
${values}
on conflict (legacy_wp_id) do update set
  slug = excluded.slug,
  title = excluded.title,
  excerpt = excluded.excerpt,
  body_md = excluded.body_md,
  cover_image_url = excluded.cover_image_url,
  meta_title = excluded.meta_title,
  meta_description = excluded.meta_description,
  destination_id = excluded.destination_id,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  legacy_url = excluded.legacy_url,
  updated_at = now();
`;
}

/**
 * Gera `public/blog/<slug>.md` para a content negotiation em `text/markdown`.
 *
 * Crawler de IA não executa JavaScript, e o `src/worker.ts` já responde
 * `Accept: text/markdown` servindo o `.md` de mesmo caminho. Sem estes arquivos
 * o pedido cai no llms.txt genérico e o agente nunca lê o post. O bloco de
 * cabeçalho dá ao agente o que a página dá ao humano: título, data e canônica.
 */
function writeMarkdown(rows, report) {
  const dir = "public/blog";
  fs.mkdirSync(dir, { recursive: true });

  for (const r of rows) {
    const header = [
      `# ${r.title}`,
      "",
      `> ${r.meta_description ?? r.excerpt ?? ""}`.trim(),
      "",
      `- Publicado em: ${r.published_at.slice(0, 10)}`,
      `- URL: https://hub.movepark.co/blog/${r.slug}/`,
      r.destination_slug
        ? `- Estacionamentos deste aeroporto: https://hub.movepark.co/destinos/${r.destination_slug}`
        : null,
      "",
      "---",
      "",
    ]
      .filter((l) => l !== null)
      .join("\n");

    fs.writeFileSync(path.join(dir, `${r.slug}.md`), `${header}${r.body_md}\n`);
    report.markdownWritten++;
  }
  console.log(`  markdown para agentes: ${report.markdownWritten} arquivos em ${dir}/`);
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeEntities(s) {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#8217;", "'")
    .replaceAll("&#8216;", "'")
    .replaceAll("&#8220;", '"')
    .replaceAll("&#8221;", '"')
    .replaceAll("&#8211;", "-")
    .replaceAll("&#038;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&hellip;", "...");
}

function printReport(r, dryRun) {
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(`\n${dryRun ? "[dry-run] " : ""}Importação do blog`);
  console.log(`  posts processados:        ${r.posts}`);
  console.log(`  com destino vinculado:    ${r.withDestination}`);
  console.log(`  sem destino:              ${r.withoutDestination.length}`);
  console.log(`  com meta title do Yoast:  ${r.withMetaTitle}`);
  console.log(`  com meta description:     ${r.withMetaDescription}`);
  console.log(`  links reescritos:         ${r.linksReescritos}`);
  console.log(`  links virados texto:      ${r.linksRemovidos}`);
  console.log(`  alt preenchidos:          ${r.altPreenchidos}`);
  console.log(`  blocos repetidos tirados: ${r.blocosRepetidos}`);
  if (r.imagesReused) console.log(`  imagens reaproveitadas:   ${r.imagesReused}`);
  if (r.imagesConverted || r.imagesSkipped) {
    console.log(`  imagens convertidas:      ${r.imagesConverted} (${mb(r.imagesBefore)} MB -> ${mb(r.imagesAfter)} MB)`);
    console.log(`  imagens já presentes:     ${r.imagesSkipped}`);
  }
  if (r.uploaded) console.log(`  enviadas ao Storage:      ${r.uploaded} (assets-public/blog/)`);
  if (r.uploadsFailed.length) console.log(`  falhas de upload:         ${r.uploadsFailed.length}`);
  if (r.externalDropped.length) console.log(`  imagens externas descartadas: ${r.externalDropped.length}`);
  if (r.imagesFailed.length) console.log(`  imagens com falha:        ${r.imagesFailed.length}`);
  if (r.withoutDestination.length) {
    console.log("\n  posts sem destino:");
    for (const s of r.withoutDestination) console.log(`    - ${s}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
