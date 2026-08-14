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

const SITE_URL = "https://hub.movepark.co";

// Listagens /p/<company>/<location>/<parkingType> ativas (sitemap).
async function getDynamicRoutes(sb: SupabaseClient | null): Promise<string[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("location_parking_type")
    .select(
      `
      location:location!inner(slug, company:company!inner(slug)),
      company_parking_type:company_parking_type!inner(parking_type:parking_type!inner(code))
    `,
    )
    .eq("is_active", true);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map(
    (r: any) =>
      `/p/${r.location.company.slug}/${r.location.slug}/${r.company_parking_type.parking_type.code}`,
  );
}

// Páginas de destino (SEO) — /destinos/<slug> de cada destino publicado.
async function getDestinationRoutes(sb: SupabaseClient | null): Promise<string[]> {
  if (!sb) return [];

  const { data } = await sb.from("destination").select("slug").eq("is_published", true);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((d: any) => `/destinos/${d.slug}`);
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
async function getProspectRoutes(sb: SupabaseClient | null): Promise<string[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("prospect_location")
    .select("slug, destination:destination(slug)")
    .eq("is_published", true)
    .is("converted_at", null);

  return (data ?? [])
    // deno-lint-ignore no-explicit-any
    .map((p: any) =>
      p.destination?.slug ? `/estacionamentos/${p.destination.slug}/${p.slug}` : null,
    )
    .filter((r: string | null): r is string => r !== null);
}

/**
 * Páginas por pergunta do FAQ (/faq/<slug>): cada pergunta global ou de destino
 * publicada com slug é uma URL própria, answer-first, pré-renderizada no build.
 */
async function getFaqRoutes(sb: SupabaseClient | null): Promise<string[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("faq")
    .select("slug")
    .eq("is_published", true)
    .is("deleted_at", null)
    .not("slug", "is", null);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((f: any) => `/faq/${f.slug}`);
}

/**
 * Posts do blog. A barra final é obrigatória: é a URL canônica herdada do
 * WordPress, e é ela que o Google já conhece. Ver docs/specs/blog.md.
 */
async function getBlogRoutes(sb: SupabaseClient | null): Promise<string[]> {
  if (!sb) return [];

  const { data } = await sb
    .from("blog_post")
    .select("slug")
    .eq("is_published", true)
    .is("deleted_at", null);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((p: any) => `/blog/${p.slug}/`);
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

  const [listingRoutes, destinationRoutes, blogRoutes, prospectRoutes, faqRoutes] =
    await Promise.all([
      getDynamicRoutes(sb),
      getDestinationRoutes(sb),
      getBlogRoutes(sb),
      getProspectRoutes(sb),
      getFaqRoutes(sb),
    ]);
  // Índice de destinos + uma URL por destino publicado, além das listagens /p/...
  // e dos posts do blog (com barra final, contrato herdado do WordPress).
  writeBlogSlugManifest(blogRoutes);

  // As estáticas entram por lista porque o plugin roda antes do pré-render e não teria como
  // descobri-las sozinho (ver src/lib/sitemapRoutes.ts).
  // Set porque o plugin já injeta "/" por conta própria: sem dedupe o sitemap sai com a
  // home repetida, que é sitemap inválido.
  const dynamicRoutes = [
    ...new Set([
      ...SITEMAP_STATIC_ROUTES,
      "/destinos",
      "/blog/",
      ...listingRoutes,
      ...destinationRoutes,
      ...blogRoutes,
      ...prospectRoutes,
      ...faqRoutes,
    ]),
  ].filter((r) => r !== "/");

  return {
    plugins: [
      react(),
      sitemap({
        hostname: SITE_URL,
        dynamicRoutes,
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
