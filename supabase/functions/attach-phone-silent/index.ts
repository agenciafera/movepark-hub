// Edge Function: /attach-phone-silent
// Anexa o telefone informado no checkout ao auth.users da conta em sessão, SEM OTP, com guarda de
// colisão. Objetivo: lembrar o telefone (pré-preencher da próxima) e habilitar login por WhatsApp.
//
// ⚠️ DESVIO CONSCIENTE DA ADR-006 (decisão de produto): a ADR-006 exige verificação (OTP) pra
// promover um identificador a credencial. Aqui gravamos direto. A guarda que resta é a checagem de
// colisão: se o número já é de OUTRA conta, NÃO escrevemos nada (evita sequestro de conta alheia).
// O pagamento NÃO depende disto (lê o telefone do snapshot do booking); isto é só conveniência.
//
// POST /functions/v1/attach-phone-silent   Authorization: Bearer <JWT>
//   { phone: "+55..." }
// → { status: "attached" | "collision" | "already_set" | "invalid" }

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
  // @ts-expect-error - Deno env
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
  const uid = userData.user.id;

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const phone = normalizePhone(body.phone);
  if (!phone) return jsonResponse({ status: "invalid" });

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Já tem telefone na conta? Não sobrescreve (o checkout só chama quando está vazio, mas garantimos).
  if (userData.user.phone) {
    const sameDigits =
      userData.user.phone.replace(/\D/g, "") === phone.replace(/\D/g, "");
    return jsonResponse({ status: sameDigits ? "attached" : "already_set" });
  }

  // Guarda de colisão: se o número já é de outra conta, não escreve nada (evita sequestro).
  const { data: ownerB } = await admin.rpc("find_user_by_identifier", {
    p_channel: "phone",
    p_identifier: phone,
  });
  if (ownerB && ownerB !== uid) return jsonResponse({ status: "collision" });

  const { error } = await admin.auth.admin.updateUserById(uid, { phone, phone_confirm: true });
  if (error) {
    // Corrida rara: o número virou de outra conta entre a checagem e a escrita → trata como colisão.
    console.error("[attach-phone-silent] updateUserById falhou:", error.message);
    return jsonResponse({ status: "collision" });
  }
  return jsonResponse({ status: "attached" });
});
