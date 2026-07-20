// Edge Function: /redeem-checkout-handoff
// Troca o segredo do link (fragment #ht=) pela sessão do usuário, uma única vez. O front chama esta
// Edge, faz supabase.auth.setSession() com os tokens devolvidos e segue pro checkout já logado.
// Anon (verify_jwt=false): a autorização é a posse do segredo de alta entropia (uso único + TTL 15min).
// Ver docs/specs/customer/agent-booking.md §6.
//
// POST /functions/v1/redeem-checkout-handoff   { token: "<segredo do #ht=>" }
// → { booking_code, access_token, refresh_token }  |  410 se inválido/usado/expirado

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { prefixOf, sha256Hex } from "../create-checkout-handoff/logic.ts";

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

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const secret = typeof body.token === "string" ? body.token.trim() : "";
  if (!secret) return json({ error: "token obrigatório" }, 422);

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("checkout_handoff_redeem", {
    p_prefix: prefixOf(secret),
    p_hash: await sha256Hex(secret),
  });
  if (error) {
    console.error("[redeem-checkout-handoff] rpc falhou:", error.message);
    return json({ error: "Falha ao resgatar o link" }, 500);
  }
  const res = data as {
    ok?: boolean;
    booking_code?: string;
    access_token?: string;
    refresh_token?: string;
  };
  if (!res?.ok) {
    // Link já usado, expirado ou inválido. 410 Gone (o front manda o usuário logar normalmente).
    return json({ error: "Link inválido ou já usado" }, 410);
  }
  return json({
    booking_code: res.booking_code,
    access_token: res.access_token,
    refresh_token: res.refresh_token,
  });
});
