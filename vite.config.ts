import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import path from "node:path";
import sitemap from "vite-plugin-sitemap";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// Import RELATIVO e para um módulo sem nenhum import próprio: o Vite empacota este config
// com esbuild antes de conhecer o alias "@", então qualquer coisa que puxe src/ em cadeia
// quebraria o build.
import {
  SITEMAP_OPT_OUT,
  SITEMAP_PRIVATE_PREFIXES,
  SITEMAP_STATIC_ROUTES,
} from "./src/lib/sitemapRoutes";
// Mesma função que o split usa para o lastmod do índice. Uma só, para as duas pontas não
// divergirem sobre o que é "a data mais recente".
import { maisRecenteDentre } from "./scripts/sitemap-split.logic.mjs";
// Mesma paginação do getStaticPaths da listagem (src/routes.tsx): sem ela, o sitemap podia
// contar página diferente do que o SSG de fato gera. Módulo puro, sem import próprio, então
// entra na mesma exceção do site-host.mjs e do sitemapRoutes.ts.
import { totalPages } from "./src/features/blog/listing.logic";
// Host canônico: um lugar só, compartilhado com o front e com os scripts de pós-build.
// Aqui ele define o `hostname` de TODAS as `<loc>` do sitemap, e sitemap com host errado é
// sitemap ignorado pelo Google.
import { DEFAULT_SITE_URL } from "./src/lib/site-host.mjs";

/**
 * Onde o mapa de seções do sitemap é entregue ao `scripts/split-sitemap.mjs`.
 *
 * Fora do `dist/` de propósito: arquivo de trabalho que vaza para o `dist/` é arquivo que vai
 * para produção. O split apaga o mapa depois de ler, então mapa velho de build anterior não
 * existe para ser usado por engano.
 */
const MAPA_DE_SECOES = "node_modules/.cache/movepark-sitemap-sections.json";

/**
 * Uma URL do sitemap com a data que o banco conhece para ela.
 *
 * O `lastmod` só existe quando há data de verdade. Página sem linha no banco (as
 * institucionais) fica sem, e o plugin cai no default dele. Ver a seção "Sitemap" em
 * docs/specs/seo-indexacao.md.
 */
type RotaComData = { route: string; lastmod?: string };

// Listagens /p/<company>/<location>/<parkingType> ativas (sitemap).
async function getDynamicRoutes(
  sb: SupabaseClient | null,
): Promise<(RotaComData & { destinationId?: string })[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("location_parking_type")
    .select(
      `
      updated_at,
      location:location!inner(slug, destination_id, company:company!inner(slug)),
      company_parking_type:company_parking_type!inner(parking_type:parking_type!inner(code))
    `,
    )
    .eq("is_active", true);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => ({
    route: `/p/${r.location.company.slug}/${r.location.slug}/${r.company_parking_type.parking_type.code}`,
    lastmod: r.updated_at,
    destinationId: r.location.destination_id ?? undefined,
  }));
}

// Páginas de destino (SEO) — /destinos/<slug> de cada destino publicado.
async function getDestinationRoutes(
  sb: SupabaseClient | null,
): Promise<(RotaComData & { id: string; slug: string })[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("destination")
    .select("id, slug, updated_at")
    .eq("is_published", true);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((d: any) => ({
    route: `/destinos/${d.slug}`,
    lastmod: d.updated_at,
    id: d.id,
    slug: d.slug,
  }));
}

/**
 * Lotes MAPEADOS publicados (E0.17-e). Página sem reserva e sem preço, mas com
 * `ParkingFacility`, endereço estruturado e geo: é conteúdo que a Movepark quer
 * indexado, e é o que substitui as 41 URLs do WordPress no cutover. Fora do
 * sitemap, a página dependeria só do link interno da página de destino.
 *
 * `converted_at is null` porque ficha convertida virou `location`: mandar as duas
 * ao sitemap seria pedir para o Google escolher entre duas páginas nossas.
 */
async function getProspectRoutes(sb: SupabaseClient | null): Promise<RotaComData[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("prospect_location")
    .select("slug, updated_at, destination:destination(slug)")
    .eq("is_published", true)
    .is("converted_at", null);

  return (data ?? [])
    // deno-lint-ignore no-explicit-any
    .map((p: any): RotaComData | null =>
      p.destination?.slug
        ? { route: `/estacionamentos/${p.destination.slug}/${p.slug}`, lastmod: p.updated_at }
        : null,
    )
    .filter((r): r is RotaComData => r !== null);
}

/**
 * Páginas por pergunta do FAQ (/faq/<slug>): cada pergunta global ou de destino
 * publicada com slug é uma URL própria, answer-first, pré-renderizada no build.
 */
async function getFaqRoutes(sb: SupabaseClient | null): Promise<RotaComData[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("faq")
    .select("slug, updated_at")
    .eq("is_published", true)
    .is("deleted_at", null)
    .not("slug", "is", null);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((f: any) => ({ route: `/faq/${f.slug}`, lastmod: f.updated_at }));
}

/**
 * Páginas "mais barato" (/estacionamento-mais-barato/<slug>): entra no sitemap o
 * mesmo conjunto que o getStaticPaths gera, ou seja, destino com ao menos um
 * preço de carro na matriz do motor (RPC destination_price_index). /precos cobre
 * todos os destinos (mapeados entram sem preço); esta intenção não. Falha da RPC
 * deixa as URLs fora do sitemap; as páginas continuam existindo pelo SSG.
 */
async function getMaisBaratoRoutes(
  sb: SupabaseClient | null,
): Promise<{ route: string; slug: string }[]> {
  if (!sb) return [];

  const { data } = await sb.rpc("destination_price_index", {});
  // deno-lint-ignore no-explicit-any
  const destinations: any[] = (data as any)?.destinations ?? [];
  return destinations
    .filter((d) =>
      // deno-lint-ignore no-explicit-any
      (d.units ?? []).some(
        (u: any) =>
          u.parking_type_code !== "motorcycle" &&
          // deno-lint-ignore no-explicit-any
          (u.prices ?? []).some((p: any) => p.total != null),
      ),
    )
    .map((d) => ({ route: `/estacionamento-mais-barato/${d.slug}`, slug: d.slug }));
}

/**
 * Posts do blog. A barra final é obrigatória: é a URL canônica herdada do
 * WordPress, e é ela que o Google já conhece. Ver docs/specs/blog.md.
 */
async function getBlogRoutes(sb: SupabaseClient | null): Promise<RotaComData[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("blog_post")
    .select("slug, published_at, updated_at")
    .eq("is_published", true)
    .is("deleted_at", null);

  // `greatest` dos dois, e não só `updated_at`: post importado do WordPress e nunca editado
  // aqui tem os dois iguais (migration 20261028120000 devolveu o sentido ao `updated_at`),
  // e post editado depois tem `updated_at` maior. Ver docs/specs/blog.md.
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((p: any) => ({
    route: `/blog/${p.slug}/`,
    lastmod: maisRecenteDentre(p.published_at, p.updated_at),
  }));
}

/**
 * Taxonomia e paginação do blog: /blog/page/N, /blog/categoria/<slug>, /blog/tag/<slug>,
 * /blog/autor/<slug>, /blog/aeroporto/<slug>, cada uma com a própria paginação.
 *
 * Espelha o `blogListingPaths` de `src/routes.tsx` (mesma contagem, mesmo `PAGE_SIZE`), que é
 * quem decide quais dessas páginas o `getStaticPaths` de fato pré-renderiza no `dist/`. As
 * duas listas divergirem seria sitemap anunciando URL que o build não gerou, ou o inverso.
 * Ficaram de fora do sitemap desde a criação da seção (17/08/2026, ver
 * `SITEMAP_BLOG_TAXONOMY_PENDING` em `sitemapRoutes.ts`) porque exigiam a mesma consulta de
 * agrupamento que só valia a pena escrever uma vez.
 */
async function getBlogTaxonomyRoutes(sb: SupabaseClient | null): Promise<RotaComData[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("blog_post")
    .select(
      "published_at, updated_at," +
        " destination:destination(slug)," +
        " category:blog_category(slug)," +
        " author:blog_author(slug)," +
        " tags:blog_post_tag(tag:blog_tag(slug))",
    )
    .eq("is_published", true)
    .is("deleted_at", null);

  // deno-lint-ignore no-explicit-any
  const posts = (data ?? []) as any[];
  const rotas: RotaComData[] = [];

  for (let page = 2; page <= totalPages(posts.length); page++) {
    rotas.push({ route: `/blog/page/${page}` });
  }

  const grupos = {
    categoria: new Map<string, { count: number; lastmods: string[] }>(),
    tag: new Map<string, { count: number; lastmods: string[] }>(),
    autor: new Map<string, { count: number; lastmods: string[] }>(),
    aeroporto: new Map<string, { count: number; lastmods: string[] }>(),
  };
  const acumula = (
    mapa: Map<string, { count: number; lastmods: string[] }>,
    slug: string | undefined,
    lastmod: string | undefined,
  ) => {
    if (!slug) return;
    const atual = mapa.get(slug) ?? { count: 0, lastmods: [] };
    atual.count += 1;
    if (lastmod) atual.lastmods.push(lastmod);
    mapa.set(slug, atual);
  };

  for (const p of posts) {
    const lastmod = maisRecenteDentre(p.published_at, p.updated_at);
    acumula(grupos.categoria, p.category?.slug, lastmod);
    acumula(grupos.autor, p.author?.slug, lastmod);
    acumula(grupos.aeroporto, p.destination?.slug, lastmod);
    // deno-lint-ignore no-explicit-any
    for (const t of (p.tags ?? []) as any[]) acumula(grupos.tag, t.tag?.slug, lastmod);
  }

  for (const [kind, mapa] of Object.entries(grupos) as [
    keyof typeof grupos,
    Map<string, { count: number; lastmods: string[] }>,
  ][]) {
    for (const [slug, { count, lastmods }] of mapa) {
      const lastmod = maisRecenteDentre(...lastmods);
      rotas.push({ route: `/blog/${kind}/${slug}`, lastmod });
      for (let page = 2; page <= totalPages(count); page++) {
        rotas.push({ route: `/blog/${kind}/${slug}/page/${page}`, lastmod });
      }
    }
  }

  return rotas;
}

/**
 * Índice de preços: /precos/<slug> por destino publicado com unidade
 * precificada. Os slugs vêm da mesma RPC que alimenta o loader SSG, então o
 * sitemap e o pré-render nunca divergem sobre quais páginas existem.
 */
async function getPrecosRoutes(
  sb: SupabaseClient | null,
): Promise<{ route: string; slug: string }[]> {
  if (!sb) return [];

  const { data } = await sb.rpc("destination_price_index");

  // deno-lint-ignore no-explicit-any
  const destinos = (((data as any)?.destinations ?? []) as { slug: string }[]);
  return destinos.map((d) => ({ route: `/precos/${d.slug}`, slug: d.slug }));
}

/**
 * Manifesto de slugs publicados, lido pelo worker para devolver 404 de verdade.
 *
 * Sem ele, `/blog/qualquer-coisa/` caía no fallback da SPA e respondia 200 com a
 * casca do app. Para o Google isso é soft 404: ele indexa a URL como página real
 * e vazia, que foi parte do que sujou o índice do site legado.
 */
function writeBlogSlugManifest(routes: string[]) {
  // Lista vazia é sintoma de Supabase fora do ar, não de blog sem post. Gravar
  // ela faria o worker devolver 404 em 93 URLs que o Google já indexa, então o
  // manifest versionado fica como está e o build segue com o que tem.
  if (!routes.length) return;
  // Ordenado porque o worker só consulta pertinência, e a ordem que vem do banco
  // muda a cada build: sem isto o arquivo aparece modificado em todo commit.
  const slugs = routes.map((r) => r.replace(/^\/blog\//, "").replace(/\/$/, "")).sort();
  fs.mkdirSync("public", { recursive: true });
  fs.writeFileSync("public/blog-slugs.json", JSON.stringify(slugs));
}

export default defineConfig(async ({ mode }) => {
  // `loadEnv` lê os .env (versionados; a anon key é pública) — o Vite NÃO injeta o
  // .env em process.env, então sem isto o sitemap sairia vazio no build local/deploy.
  const env = loadEnv(mode, process.cwd(), "");
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  const sb = url && key ? createClient(url, key) : null;

  const [
    listingRoutes,
    destinationRoutes,
    blogRoutes,
    blogTaxonomyRoutes,
    prospectRoutes,
    faqRoutes,
    precosRoutes,
    maisBaratoRoutes,
  ] = await Promise.all([
      getDynamicRoutes(sb),
      getDestinationRoutes(sb),
      getBlogRoutes(sb),
      getBlogTaxonomyRoutes(sb),
      getProspectRoutes(sb),
      getFaqRoutes(sb),
      getPrecosRoutes(sb),
      getMaisBaratoRoutes(sb),
    ]);
  // Índice de destinos + uma URL por destino publicado, além das listagens /p/...
  // e dos posts do blog (com barra final, contrato herdado do WordPress).
  writeBlogSlugManifest(blogRoutes.map((r) => r.route));

  /**
   * Data de cada página de preço, herdada das unidades daquele destino.
   *
   * A RPC `destination_price_index` devolve preço, não data. A data honesta de uma página de
   * preço é a da última mexida em preço ou capacidade, que mora no `location_parking_type`.
   * Sem isto, `/precos/*` e `/estacionamento-mais-barato/*` ficariam com a data do build,
   * que muda a cada deploy mesmo sem preço nenhum ter mudado.
   */
  const dataPorDestino = new Map<string, string>();
  for (const unidade of listingRoutes) {
    if (!unidade.destinationId || !unidade.lastmod) continue;
    const atual = dataPorDestino.get(unidade.destinationId);
    dataPorDestino.set(unidade.destinationId, maisRecenteDentre(atual, unidade.lastmod)!);
  }
  const idPorSlugDeDestino = new Map(destinationRoutes.map((d) => [d.slug, d.id]));
  const dataDePreco = (slug: string) => {
    const id = idPorSlugDeDestino.get(slug);
    return id ? dataPorDestino.get(id) : undefined;
  };

  const precosComData: RotaComData[] = precosRoutes.map((p) => ({
    route: p.route,
    lastmod: dataDePreco(p.slug),
  }));
  const maisBaratoComData: RotaComData[] = maisBaratoRoutes.map((p) => ({
    route: p.route,
    lastmod: dataDePreco(p.slug),
  }));

  /** Capa de seção: muda quando qualquer filho muda, então herda a data mais recente deles. */
  const capa = (path: string, filhos: RotaComData[]): RotaComData => ({
    route: path,
    lastmod: maisRecenteDentre(...filhos.map((f) => f.lastmod)),
  });

  const todasAsRotas: RotaComData[] = [
    // `/faq` sai daqui e entra como capa: ela é a porta da seção de perguntas, e a data dela
    // é a da pergunta mais recente, não a do build.
    ...SITEMAP_STATIC_ROUTES.filter((r) => r !== "/faq").map((route) => ({ route })),
    capa("/destinos", destinationRoutes),
    capa("/precos", precosComData),
    capa("/blog/", blogRoutes),
    capa("/faq", faqRoutes),
    ...listingRoutes,
    ...destinationRoutes,
    ...blogRoutes,
    ...blogTaxonomyRoutes,
    ...prospectRoutes,
    ...faqRoutes,
    ...precosComData,
    ...maisBaratoComData,
  ];

  // As estáticas entram por lista porque o plugin roda antes do pré-render e não teria como
  // descobri-las sozinho (ver src/lib/sitemapRoutes.ts).
  // Set porque o plugin já injeta "/" por conta própria: sem dedupe o sitemap sai com a
  // home repetida, que é sitemap inválido.
  const dynamicRoutes = [...new Set(todasAsRotas.map((r) => r.route))].filter((r) => r !== "/");

  /**
   * `lastmod` por rota, entregue ao plugin.
   *
   * A chave tem que ser a rota NORMALIZADA: o plugin roda `parse(route).name` internamente e
   * transforma `/blog/slug/` em `/blog/slug` antes de procurar a data. Com a barra, a busca
   * erra e o post cairia no default (data do build).
   *
   * Rota sem data nenhuma fica fora do mapa de propósito, e o plugin usa o default dele. É o
   * caso das institucionais: elas não têm linha em banco, e inventar data para elas seria a
   * mentira que este trabalho existe para tirar do sitemap.
   */
  const lastmodPorRota: Record<string, Date> = {};
  for (const { route, lastmod } of todasAsRotas) {
    if (!lastmod) continue;
    const chave = route.replace(/\/+$/, "") || "/";
    const data = new Date(lastmod);
    const atual = lastmodPorRota[chave];
    if (!atual || data > atual) lastmodPorRota[chave] = data;
  }

  /**
   * Mapa de seções do sitemap, consumido pelo `scripts/split-sitemap.mjs`.
   *
   * A classificação nasce aqui, de quem buscou cada URL, e NÃO de prefixo de path adivinhado
   * depois. Rota nova só precisa aparecer nesta lista para virar (ou entrar numa) seção; se
   * esquecerem, ela cai em `paginas` e o split reporta como órfã.
   *
   * `/faq`, `/destinos`, `/precos` e `/blog/` são as capas de cada seção e viajam com ela,
   * não com as institucionais.
   */
  const so = (rotas: RotaComData[]) => rotas.map((r) => r.route);
  const secoesDoSitemap: Record<string, string[]> = {
    blog: ["/blog/", ...so(blogRoutes), ...so(blogTaxonomyRoutes)],
    destinos: ["/destinos", ...so(destinationRoutes)],
    estacionamentos: so(prospectRoutes),
    faq: ["/faq", ...so(faqRoutes)],
    "mais-barato": so(maisBaratoComData),
    paginas: SITEMAP_STATIC_ROUTES.filter((r) => r !== "/faq"),
    precos: ["/precos", ...so(precosComData)],
    unidades: so(listingRoutes),
  };

  return {
    plugins: [
      {
        name: "movepark:sitemap-sections",
        closeBundle() {
          fs.mkdirSync(path.dirname(MAPA_DE_SECOES), { recursive: true });
          fs.writeFileSync(MAPA_DE_SECOES, JSON.stringify(secoesDoSitemap));
        },
      },
      react(),
      sitemap({
        // `loadEnv` deixa o build de preview publicar o próprio host em vez do de produção.
        hostname: (env.VITE_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, ""),
        dynamicRoutes,
        // Data real por URL, vinda do banco. Rota ausente do mapa usa o default do plugin
        // (data do build), que hoje é o caso só das institucionais.
        lastmod: lastmodPorRota,
        // NÃO gerar robots.txt aqui — o plugin sobrescreveria o public/robots.txt curado
        // (allowlist/blocklist de bots + Content Signals). Só o sitemap.xml é gerado. (E0.8-a/b)
        generateRobotsTxt: false,
        // Uma fonte só para o que fica fora: as rotas públicas com opt-out declarado e
        // tudo abaixo dos prefixos de área logada.
        exclude: [
          ...Object.keys(SITEMAP_OPT_OUT).filter((r) => r !== "*"),
          "/forgot-password",
          ...SITEMAP_PRIVATE_PREFIXES.flatMap((p) => [p, `${p}/*`]),
        ],
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // Honra a porta atribuída pelo harness de preview (env PORT) — com strictPort
      // para bater exatamente nela em vez de incrementar. Sem PORT, usa 5173 (dev local).
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: !!process.env.PORT,
      host: true,
    },
  };
});
