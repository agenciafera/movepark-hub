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
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
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

/** Slug de aeroporto no legado → slug do destino no Hub (para reescrever links internos). */
const LEGACY_AIRPORT_TO_DESTINATION = {
  "aeroporto-viracopos": "aeroporto-de-viracopos",
  "aeroporto-afonso-pena": "aeroporto-afonso-pena",
  "aeroporto-congonhas": "aeroporto-de-congonhas",
  "aeroporto-guarulhos": "aeroporto-internacional-de-sao-paulo-guarulhos",
  "aeroporto-confins": "aeroporto-de-confins",
  "aeroporto-santos-dumont-rio": "aeroporto-santos-dumont",
  "aeroporto-rio-galeao": "aeroporto-do-galeao",
  "aeroporto-brasilia": "aeroporto-de-brasilia",
  "aeroporto-salgado-filho": "aeroporto-salgado-filho",
  "terminal-rodoviario-tiete": "terminal-rodoviario-tiete",
  campinas: "aeroporto-de-viracopos",
  cgh: "aeroporto-de-congonhas",
};

const args = process.argv.slice(2);
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
 * Reescreve links internos do legado para as rotas do Hub.
 *
 * Só mexe no que tem par certo no Hub. Link de página de unidade fica absoluto:
 * ele pertence ao corte do /estacionamentos/, que é outra entrega.
 */
function rewriteLinks(md) {
  let out = md;
  for (const [legacy, hub] of Object.entries(LEGACY_AIRPORT_TO_DESTINATION)) {
    out = out.replaceAll(
      `https://movepark.co/estacionamentos/${legacy}/`,
      `/destinos/${hub}`,
    );
  }
  out = out.replaceAll("https://movepark.co/blog/", "/blog/");
  out = out.replace(/\]\(https:\/\/movepark\.co\/?\)/g, "](/)");
  return out;
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
    imagesSkipped: 0,
    imagesFailed: [],
    externalDropped: [],
    imagesBefore: 0,
    imagesAfter: 0,
    markdownWritten: 0,
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

    const bodyMd = rewriteLinks(turndown.turndown(html))
      .replace(/\n{3,}/g, "\n\n")
      .trim();

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
