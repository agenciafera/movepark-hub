#!/usr/bin/env node
/**
 * Deriva categoria editorial e tags dos posts do blog a partir do próprio texto.
 *
 * Por que derivar: o WordPress trazia 11 categorias, e 8 delas eram aeroporto,
 * que no Hub já é `blog_post.destination_id`. De tag, 84 dos 93 posts não tinham
 * nenhuma. Ou seja, não havia taxonomia editorial para importar.
 *
 * As regras são determinísticas e ficam neste arquivo, versionadas: rodar de novo
 * dá o mesmo resultado, e mudar a classificação é mudar a regra, não o banco.
 * A ordem importa, a primeira categoria que casar vence.
 *
 * Uso:
 *   node scripts/blog-taxonomy.mjs --report          # distribuição, sem escrever
 *   node scripts/blog-taxonomy.mjs --json saida.json # payload para carga
 */

import fs from "node:fs";

const WP = "https://movepark.co/wp-json/wp/v2";

/**
 * Categoria editorial. Uma por post, da mais específica para a mais genérica.
 * `Guias` é o fundo do funil de classificação e absorve o que não casar antes.
 */
export const CATEGORIES = [
  {
    slug: "precos",
    name: "Preços",
    description: "Quanto custa a diária, o que entra no valor e onde dá para economizar.",
    match: /pre[çc]o|valor|quanto custa|di[áa]ria|barato|econom|desconto|tarifa/i,
  },
  {
    slug: "comparativos",
    name: "Comparativos",
    description: "Comparações entre estacionamentos do mesmo aeroporto.",
    match: /top \d|melhor(es)?|comparativ|ranking|principais|op[çc][õo]es|vantagens/i,
  },
  {
    slug: "como-reservar",
    name: "Como reservar",
    description: "Reserva antecipada, pagamento e o que fazer na chegada.",
    match: /como reservar|reserv(a|ar)|antecipad|pagamento|garantir sua vaga/i,
  },
  {
    slug: "dicas-de-viagem",
    name: "Dicas de viagem",
    description: "O que resolver antes de sair de casa e no aeroporto.",
    match: /dica|escala|partida|viaj|viagem|embarque|tranquil/i,
  },
  {
    slug: "guias",
    name: "Guias",
    description: "Panorama completo de um aeroporto e do entorno.",
    match: /.*/,
  },
];

/**
 * Tags. Vários por post, e valem por assunto transversal, não por aeroporto:
 * aeroporto já é o destino, e repetir aqui só criaria dois nomes para a mesma coisa.
 */
export const TAGS = [
  { slug: "vaga-coberta", name: "Vaga coberta", match: /cobert[ao]|garagem cobert|sol e chuva/i },
  { slug: "valet", name: "Valet", match: /valet|manobrist|leve a chave|deixe a chave/i },
  { slug: "traslado", name: "Traslado", match: /traslado|transfer|van|shuttle|leva e traz/i },
  { slug: "seguranca", name: "Segurança", match: /seguran[çc]a (do|no|da)|monitorament|c[âa]mera|cftv|vigil[âa]ncia|circuito fechado/i },
  { slug: "economia", name: "Economia", match: /economi[az]|mais barat|desconto|cupom|promo[çc][ãa]o|mais em conta|pagar menos/i },
  { slug: "estadia-longa", name: "Estadia longa", match: /\b\d+\s*dias|semana|longa|per[íi]odo prolongado|f[ée]rias/i },
  { slug: "reserva-online", name: "Reserva online", match: /reserv(a|ar) online|antecipad|pela internet|pelo site|app/i },
  { slug: "estrutura", name: "Estrutura", match: /estrutura|edif[íi]cio garagem|coberto e descoberto|capacidade|vagas dispon/i },
  { slug: "cancelamento", name: "Cancelamento", match: /cancel|remarcar|alterar a reserva|reembolso/i },
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

/** Nome de exibição a partir do login do WordPress (`leo.henrique` → `Leo Henrique`). */
export function displayName(login) {
  return login
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function categoryFor(text) {
  return CATEGORIES.find((c) => c.match.test(text)) ?? CATEGORIES[CATEGORIES.length - 1];
}

/**
 * Tag exige sinal forte: ou o assunto está no título, ou aparece pelo menos três
 * vezes no corpo.
 *
 * Casar uma menção qualquer no corpo não funcionava: quase todo post cita
 * segurança de passagem, e a tag saía em 82 dos 93 posts. Tag que cobre 88% do
 * acervo não filtra nada, só enfeita.
 */
const MIN_OCORRENCIAS_NO_CORPO = 5;

export function tagsFor(title, body) {
  const ocorrencias = (t) => (body.match(new RegExp(t.match.source, "gi")) ?? []).length;

  const fortes = TAGS.filter(
    (t) => t.match.test(title) || ocorrencias(t) >= MIN_OCORRENCIAS_NO_CORPO,
  );
  if (fortes.length) return fortes.map((t) => t.slug);

  // Nenhum sinal forte: fica com os dois assuntos mais citados, para o post não
  // sumir de todo filtro. Zero é pior que uma tag fraca numa listagem.
  return TAGS.map((t) => ({ t, n: ocorrencias(t) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((x) => x.t.slug);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return res.json();
}

async function main() {
  const [posts, users] = await Promise.all([
    (async () => {
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const batch = await fetchJson(`${WP}/posts?per_page=100&page=${page}&status=publish`);
        out.push(...batch);
        if (batch.length < 100) break;
      }
      return out;
    })(),
    fetchJson(`${WP}/users?per_page=100`),
  ]);

  const authors = users.map((u) => ({
    slug: u.slug,
    name: displayName(u.slug),
    legacy_wp_id: u.id,
  }));

  const rows = posts.map((p) => {
    // Título pesa mais que o corpo para a categoria: ele declara o assunto.
    const title = stripTags(p.title?.rendered ?? "");
    const body = stripTags(p.content?.rendered ?? "");
    const categoria = categoryFor(title).slug;
    const tags = tagsFor(title, body);
    const autor = users.find((u) => u.id === p.author);

    return {
      slug: p.slug,
      legacy_wp_id: p.id,
      category_slug: categoria,
      tag_slugs: tags,
      author_slug: autor?.slug ?? null,
    };
  });

  const jsonPath = opt("json", null);
  if (jsonPath) {
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        categories: CATEGORIES.map(({ slug, name, description }) => ({ slug, name, description })),
        tags: TAGS.map(({ slug, name }) => ({ slug, name })),
        authors,
        posts: rows,
      }),
    );
    console.log(`payload escrito em ${jsonPath}`);
  }

  if (flag("report") || !jsonPath) report(rows, authors);
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
}

function report(rows, authors) {
  const conta = (lista) =>
    lista.reduce((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {});

  console.log(`\nposts classificados: ${rows.length}\n`);

  console.log("categoria (uma por post):");
  const porCat = conta(rows.map((r) => r.category_slug));
  for (const c of CATEGORIES) {
    console.log(`  ${String(porCat[c.slug] ?? 0).padStart(3)}  ${c.name}`);
  }

  console.log("\ntags (várias por post):");
  const porTag = conta(rows.flatMap((r) => r.tag_slugs));
  for (const t of TAGS) {
    console.log(`  ${String(porTag[t.slug] ?? 0).padStart(3)}  ${t.name}`);
  }

  const semTag = rows.filter((r) => !r.tag_slugs.length);
  console.log(`\nposts sem nenhuma tag: ${semTag.length}`);
  for (const r of semTag.slice(0, 5)) console.log(`  - ${r.slug}`);

  const tagsPorPost = rows.map((r) => r.tag_slugs.length);
  console.log(
    `média de tags por post: ${(tagsPorPost.reduce((a, b) => a + b, 0) / rows.length).toFixed(1)}`,
  );

  console.log("\nautores:");
  const porAutor = conta(rows.map((r) => r.author_slug ?? "sem autor"));
  for (const a of authors) {
    console.log(`  ${String(porAutor[a.slug] ?? 0).padStart(3)}  ${a.name} (${a.slug})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
