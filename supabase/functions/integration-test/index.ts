// Edge Function: /integration-test
// "Testar conexão" de uma integração (docs/specs/integracoes.md § 5.9): chama o provedor com o
// token salvo no Vault sem criar nada (na Cloudpark, GET /customerplan) e devolve os planos.
//
// Quem pode: o Dono da empresa (integrations:write) e a equipe Movepark. O token nunca sai daqui:
// é lido com service role por `integration_connection_secret` e usado só na chamada ao provedor.
// Grava o resultado na conexão (last_test_*), e um teste bom limpa a marca de token inválido.
//
// POST /functions/v1/integration-test   (Authorization: Bearer <jwt do usuário>)
// body: { connection_id: uuid }
// → { ok, detail, plans? }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProvider } from "../_shared/integrations/registry.ts";
import { parseTestRequest } from "./logic.ts";

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado" }, 401);

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const parsed = parseTestRequest(body);
  if ("error" in parsed) return json({ error: parsed.error }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: conn } = await admin
    .from("integration_connection")
    .select("id, company_id, provider, config")
    .eq("id", parsed.connectionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conn) return json({ error: "Integração não encontrada" }, 404);

  // A permissão é checada com o JWT do usuário (ADR-005), nunca com o service role.
  const { data: allowed } = await userClient.rpc("member_has_scope", {
    p_company_id: conn.company_id,
    p_scope: "integrations:write",
  });
  if (!allowed) return json({ error: "Só o Dono do estacionamento testa a integração" }, 403);

  const { data: secret } = await admin.rpc("integration_connection_secret", { p_connection_id: conn.id });
  if (!secret) return json({ ok: false, detail: "Salve o token antes de testar." });

  const provider = getProvider(conn.provider);
  let result;
  try {
    result = await provider.testConnection(provider.parseConfig(conn.config), String(secret), { timeoutMs: 15_000 });
  } catch (e) {
    result = { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }

  await admin
    .from("integration_connection")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_ok: result.ok,
      last_test_detail: result.detail,
      ...(result.ok ? { auth_failed_at: null } : {}),
    })
    .eq("id", conn.id);

  return json(result);
});
