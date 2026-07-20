// Edge Function: /create-checkout-handoff
// Cria um link de uso único que faz o usuário cair LOGADO no checkout (reserva por agente, F3).
// O agente (autenticado por OTP no MCP) chama esta Edge com o JWT do usuário e o refresh_token
// da sessão; guardamos o par de tokens numa linha checkout_handoff e devolvemos a URL. O resgate
// (redeem-checkout-handoff) troca o segredo pelos tokens; o front faz setSession e segue pro checkout.
// Ver docs/specs/customer/agent-booking.md §6.
//
// POST /functions/v1/create-checkout-handoff   Authorization: Bearer <access_token do usuário>
//   { booking_code: "MP-XXXX", refresh_token: "..." }
// → { url, expires_at }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeToken, sha256Hex } from "./logic.ts";

const TTL_MINUTES = 15;

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação necessária" }, 401);

  let body: { booking_code?: string; refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const bookingCode = typeof body.booking_code === "string" ? body.booking_code.trim() : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  if (!bookingCode) return json({ error: "booking_code obrigatório" }, 422);
  if (!refreshToken) return json({ error: "refresh_token obrigatório" }, 422);

  // Valida a sessão e resolve a reserva sob a RLS do dono (o usuário só vê a própria).
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);
  const uid = userData.user.id;

  const { data: booking, error: bErr } = await userClient
    .from("booking")
    .select("id, code, status, profile_id")
    .eq("code", bookingCode)
    .maybeSingle();
  if (bErr) return json({ error: bErr.message }, 500);
  if (!booking || booking.profile_id !== uid) return json({ error: "Reserva não encontrada" }, 404);
  if (booking.status !== "pending") return json({ error: "A reserva não está pendente" }, 409);

  // Gera o segredo (prefixo indexado + sha256), guarda o par de tokens (service_role).
  const { secret, prefix } = makeToken();
  const hash = await sha256Hex(secret);
  const accessToken = authHeader.slice(7).trim();
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { error: insErr } = await admin.from("checkout_handoff").insert({
    token_prefix: prefix,
    token_hash: hash,
    profile_id: uid,
    booking_id: booking.id,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  });
  if (insErr) {
    console.error("[create-checkout-handoff] insert falhou:", insErr.message);
    return json({ error: "Falha ao criar o link" }, 500);
  }

  // O segredo viaja no fragment (#ht=), não em query string (não vaza em log/Referer).
  const site = env("PUBLIC_SITE_URL") || "https://hub.movepark.co";
  const url = `${site}/checkout/${booking.code}#ht=${secret}`;
  return json({ url, expires_at: expiresAt });
});
