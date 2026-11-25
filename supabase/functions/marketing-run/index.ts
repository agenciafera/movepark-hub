// Edge Function: /marketing-run
//
// Executa uma rodada de uma campanha de marketing pelo botão da tela do Manager. O motor mora em
// _shared/marketing/run.ts e é o mesmo que a tool marketing_run_campaign do MCP usa, então as
// travas valem igual para tela e IA (docs/specs/marketing-mcp.md § 6).
//
// POST /functions/v1/marketing-run   { "campaignId": uuid, "limit"?: number }
// → { enrolled, processed, sent, skipped, suppressed, failed, completed, dispatchEnabled,
//     testRecipient, capRemaining }
//
// Quem pode chamar: hub_admin (JWT do painel). É ferramenta de disparo em massa, então a trava é
// explícita e não depende só de `verify_jwt`.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runCampaign, RunError } from "../_shared/marketing/run.ts";
import { lerPedido } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ── Gate: só hub_admin ─────────────────────────────────────────────────────
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profile?.role !== "hub_admin") return json({ error: "forbidden" }, 403);

  // ── Entrada ────────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "payload inválido" }, 400);
  }
  const pedido = lerPedido(body);
  if (!pedido.ok) return json({ error: pedido.erro }, 400);

  try {
    const r = await runCampaign(admin, pedido.campaignId, {
      limit: pedido.limit,
      actor: { kind: "hub_admin", id: userData.user.id, label: userData.user.email ?? "hub_admin" },
    });
    return json(r);
  } catch (e) {
    if (e instanceof RunError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : "falha ao executar a campanha" }, 500);
  }
});
