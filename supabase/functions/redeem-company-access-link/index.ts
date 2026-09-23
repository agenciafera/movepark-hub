// Edge Function: /redeem-company-access-link
// Troca o segredo do link de acesso (URL /acesso/<segredo>) por uma sessão do dono da empresa.
// Anon (verify_jwt=false): a autorização é a posse do segredo de alta entropia. A RPC valida,
// conta o uso e diz quem entra; aqui a Edge gera um magic link para esse e-mail e o troca por
// sessão na hora (verifyOtp com token_hash), sem nada em repouso. O front faz setSession e vai
// para /operator/recebimento. Reutilizável até a empresa terminar o Recebimento ou o Manager revogar.
// Ver docs/specs/link-de-acesso-recebimento.md
//
// POST /functions/v1/redeem-company-access-link   { token: "<segredo>" }
// → { access_token, refresh_token, next, company_id }  |  410 { reason: "invalid" | "done" }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { prefixOf, sha256Hex } from "../create-checkout-handoff/logic.ts";
import { NEXT_PATH, parseSecret, refusal } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k)!;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const secret = parseSecret(body);
  if (!secret) return json({ error: "token obrigatório" }, 422);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("company_access_link_redeem", { p_prefix: prefixOf(secret), p_hash: await sha256Hex(secret) });
  if (error) {
    console.error("[redeem-company-access-link] rpc falhou:", error.message);
    return json({ error: "Falha ao resgatar o link" }, 500);
  }
  const res = data as { ok?: boolean; reason?: string; company_id?: string; email?: string };
  if (!res?.ok || !res.email) {
    const r = refusal(res?.reason);
    return json(r.body, r.status);
  }

  // Sessão do dono: magic link gerado agora e trocado na hora. Nenhum e-mail sai daqui.
  const magic = await admin.auth.admin.generateLink({ type: "magiclink", email: res.email });
  const tokenHash = magic.data?.properties?.hashed_token;
  if (magic.error || !tokenHash) {
    console.error("[redeem-company-access-link] magic link falhou:", magic.error?.message);
    return json({ error: "Falha ao abrir a sessão" }, 500);
  }
  const verified = await admin.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  const session = verified.data?.session;
  if (verified.error || !session) {
    console.error("[redeem-company-access-link] verifyOtp falhou:", verified.error?.message);
    return json({ error: "Falha ao abrir a sessão" }, 500);
  }

  return json({ access_token: session.access_token, refresh_token: session.refresh_token, next: NEXT_PATH, company_id: res.company_id });
});
