// Edge Function: /change-booking-dates
// Altera as datas de uma reserva PENDENTE (E2.8-f Frente B). Gateado pelo benefício da Tarifa
// `date_change` (Flex+); staff faz override. A RPC change_booking_dates re-segura capacidade e
// re-precifica; reserva paga é recusada (oriente cancelar+refazer). Dono ou staff.
//
// POST /functions/v1/change-booking-dates
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXX", "check_in_at": "...ISO...", "check_out_at": "...ISO..." }
// → { booking_id, days, total_amount }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseChangeDatesInput } from "./logic.ts";

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
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Autenticação necessária" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
  const userId = userData.user.id;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseChangeDatesInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const { data: booking, error: bErr } = await admin
    .from("booking")
    .select("id, status, profile_id, fare_benefits, location:location!inner(company_id)")
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  if (!booking) return jsonResponse({ error: "Reserva não encontrada." }, 404);

  // Autorização: dono ou staff.
  // deno-lint-ignore no-explicit-any
  const companyId = (booking as any).location?.company_id as string | undefined;
  let isStaff = false;
  if (booking.profile_id !== userId) {
    const { data: caller } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (caller?.role === "hub_admin") {
      isStaff = true;
    } else if (caller?.role === "company_operator" && companyId) {
      const { data: m } = await admin
        .from("profile_company")
        .select("company_id")
        .eq("profile_id", userId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (m) isStaff = true;
    }
    if (!isStaff) return jsonResponse({ error: "Sem permissão para alterar esta reserva." }, 403);
  }

  // deno-lint-ignore no-explicit-any
  const benefits = (booking.fare_benefits ?? {}) as Record<string, any>;
  if (!isStaff && benefits.date_change !== true) {
    return jsonResponse(
      { error: "Sua Tarifa não permite alterar datas. Faça upgrade para Flex ou Superflex." },
      403,
    );
  }

  // A RPC valida pending/min-stay/capacidade, re-segura e re-precifica (atômico).
  const { data, error } = await admin.rpc("change_booking_dates", {
    p_booking_id: booking.id,
    p_check_in: input.checkInAt,
    p_check_out: input.checkOutAt,
  });
  if (error) return jsonResponse({ error: error.message }, 400);

  return jsonResponse(data, 200);
});
