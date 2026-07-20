// Edge Function: /attach-phone-silent
// Guarda o telefone informado no checkout como DICA de pré-preenchimento da conta
// em sessão. NÃO é credencial de login: escreve profiles.preferences.unverified_phone_hint,
// nunca auth.users.phone.
//
// ADR-006: promover um identificador a credencial exige prova de posse (OTP). O caminho
// verificado é a tela "Meus logins" (Edge attach-identifier). Aqui é só conveniência — o
// checkout pré-preenche o telefone na próxima reserva. O pagamento não depende disto (lê o
// telefone do snapshot do booking).
//
// POST /functions/v1/attach-phone-silent   Authorization: Bearer <JWT>
//   { phone: "+55..." }
// → { status: "hinted" | "invalid" }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhone } from "./logic.ts";

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

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Autenticação necessária" }, 401);

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Cliente do usuário: a RPC set_phone_hint é keyed por auth.uid(), então escreve só no
  // próprio perfil. Sem service_role — não há mais mutação de credencial aqui.
  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const phone = normalizePhone(body.phone);
  if (!phone) return jsonResponse({ status: "invalid" });

  const { error } = await userClient.rpc("set_phone_hint", { p_phone: phone });
  if (error) {
    console.error("[attach-phone-silent] set_phone_hint falhou:", error.message);
    return jsonResponse({ error: "Falha ao guardar a dica de telefone" }, 500);
  }
  return jsonResponse({ status: "hinted" });
});
