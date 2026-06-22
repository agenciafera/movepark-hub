// Edge Function: /wl-sync
// Pull ao vivo da disponibilidade do white-label legado (E2.5.1).
// Gateado por wl_company_config (mesma regra da ocupação: hub_admin OU operador da empresa).
// O Bearer do WL é global (env WL_BACKEND_TOKEN) e nunca vai ao front.
//
// POST /functions/v1/wl-sync
// Authorization: Bearer <JWT>
// { "company_id": "uuid", "category_slug": "unidade-aeroporto",
//   "product_slug": "vaga-coberta", "start_date": "2026-06-22", "end_date": "2026-07-05" }
//
// Resposta: { ready: boolean, days: WlAvailabilityDay[] }
//   ready=false quando a empresa não tem integração ligada (front não mostra nada extra).

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wlGetAvailability, wlReady, type WlConfig } from "../_shared/wl/client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Input {
  company_id?: string;
  category_slug?: string;
  product_slug?: string | null;
  start_date?: string;
  end_date?: string | null;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  let input: Input;
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!input.company_id || !input.category_slug || !input.start_date) {
    return jsonResponse({ error: "company_id, category_slug e start_date são obrigatórios" }, 400);
  }

  // Cliente com o JWT do usuário → wl_company_config aplica o gating por auth.uid().
  const userClient = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );

  const { data: cfgRows, error: cfgErr } = await userClient.rpc("wl_company_config", {
    p_company_id: input.company_id,
  });
  if (cfgErr) {
    const status = cfgErr.code === "42501" ? 403 : 400;
    return jsonResponse({ error: cfgErr.message }, status);
  }

  const cfg = (cfgRows?.[0] ?? null) as WlConfig | null;
  if (!wlReady(cfg)) {
    return jsonResponse({ ready: false, days: [] });
  }

  // @ts-expect-error - Deno env
  const token = Deno.env.get("WL_BACKEND_TOKEN");
  if (!token) {
    return jsonResponse({ ready: false, days: [], error: "WL_BACKEND_TOKEN ausente no servidor" }, 500);
  }

  try {
    const days = await wlGetAvailability(cfg!, token, {
      category_slug: input.category_slug,
      product_slug: input.product_slug ?? null,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
    });
    return jsonResponse({ ready: true, days });
  } catch (e) {
    return jsonResponse({ ready: false, days: [], error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
