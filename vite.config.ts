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

export default defineConfig(async () => {
  const dynamicRoutes = await getDynamicRoutes();

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
