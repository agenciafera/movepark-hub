import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import sitemap from "vite-plugin-sitemap";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://hub.movepark.co";

async function getDynamicRoutes(): Promise<string[]> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const sb = createClient(url, key);

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
async function getDestinationRoutes(): Promise<string[]> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const sb = createClient(url, key);

  const { data } = await sb.from("destination").select("slug").eq("is_published", true);

  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((d: any) => `/destinos/${d.slug}`);
}

export default defineConfig(async () => {
  const [listingRoutes, destinationRoutes] = await Promise.all([
    getDynamicRoutes(),
    getDestinationRoutes(),
  ]);
  // Índice de destinos + uma URL por destino publicado, além das listagens /p/...
  const dynamicRoutes = ["/destinos", ...listingRoutes, ...destinationRoutes];

  return {
    plugins: [
      react(),
      sitemap({
        hostname: SITE_URL,
        dynamicRoutes,
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
      port: 5173,
      host: true,
    },
  };
});
