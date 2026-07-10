import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import sitemap from "vite-plugin-sitemap";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export default defineConfig(async ({ mode }) => {
  // `loadEnv` lê os .env (versionados; a anon key é pública) — o Vite NÃO injeta o
  // .env em process.env, então sem isto o sitemap sairia vazio no build local/deploy.
  const env = loadEnv(mode, process.cwd(), "");
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  const sb = url && key ? createClient(url, key) : null;

  const [listingRoutes, destinationRoutes] = await Promise.all([
    getDynamicRoutes(sb),
    getDestinationRoutes(sb),
  ]);
  // Índice de destinos + uma URL por destino publicado, além das listagens /p/...
  const dynamicRoutes = ["/destinos", ...listingRoutes, ...destinationRoutes];

  return {
    plugins: [
      react(),
      sitemap({
        hostname: SITE_URL,
        dynamicRoutes,
        // NÃO gerar robots.txt aqui — o plugin sobrescreveria o public/robots.txt curado
        // (allowlist/blocklist de bots + Content Signals). Só o sitemap.xml é gerado. (E0.8-a/b)
        generateRobotsTxt: false,
        exclude: [
          "/login",
          "/entrar",
          "/signup",
          "/auth/callback",
          "/forgot-password",
          "/design-system",
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
