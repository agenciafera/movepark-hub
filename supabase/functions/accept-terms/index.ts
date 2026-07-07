// Edge Function: /accept-terms
// Registra o aceite explícito dos Termos de Uso para uma reserva (opt-in do checkout, RFN005/LGPD).
// Server-authoritative: grava `terms_acceptance` com a VERSÃO vigente dos Termos + timestamp + IP
// (prova de conformidade). Idempotente por reserva. As Edges de pagamento exigem esse registro.
//
// POST /functions/v1/accept-terms
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXXXX" }
// → { ok: true, version: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  let input: { booking_code?: string };
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!input.booking_code) return jsonResponse({ error: "booking_code é obrigatório" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Reserva precisa pertencer ao usuário autenticado.
  const { data: booking } = await admin
    .from("booking")
    .select("id, profile_id")
    .eq("code", input.booking_code)
    .maybeSingle();
  if (!booking) return jsonResponse({ error: "Reserva não encontrada" }, 404);
  if (booking.profile_id !== userData.user.id) {
    return jsonResponse({ error: "Reserva não pertence a você" }, 403);
  }

  // IP do aceite (só o primeiro do x-forwarded-for; apenas auditoria).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const { data, error } = await admin.rpc("record_terms_acceptance", {
    p_booking_id: booking.id,
    p_ip: ip,
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ ok: true, version: (data as { version?: number } | null)?.version ?? null });
});
