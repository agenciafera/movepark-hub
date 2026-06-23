// Edge Function: /create-booking
// Cria booking pendente atomicamente. Wrapper sobre a SQL function `create_booking_atomic`.
// Requer JWT do usuário (Supabase Auth) — guest checkout fica pra v2.
//
// POST /functions/v1/create-booking
// Authorization: Bearer <JWT>
// {
//   "location_parking_type_id": "uuid",
//   "check_in_at": "2026-06-10T22:00:00Z",
//   "check_out_at": "2026-06-15T08:00:00Z",
//   "vehicle_id": "uuid",            // optional
//   "passenger_count": 2,            // optional
//   "has_pcd": false,                // optional
//   "add_on_service_ids": ["uuid"],  // optional
//   "coupon_code": "PROMO10",        // optional
//   "origin": "search-results"       // optional
// }
//
// Resposta:
// { code, booking_id, total_amount, subtotal, discount, days, expires_at, line_items }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateBookingInput {
  location_parking_type_id: string;
  check_in_at: string;
  check_out_at: string;
  vehicle_id?: string | null;
  passenger_count?: number | null;
  has_pcd?: boolean;
  add_on_service_ids?: string[] | null;
  coupon_code?: string | null;
  origin?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  // Cliente com JWT do usuário (pra ler auth.uid())
  const userClient = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: "Sessão inválida" }, 401);
  }

  const profileId = userData.user.id;

  let input: CreateBookingInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!input.location_parking_type_id) {
    return jsonResponse({ error: "location_parking_type_id é obrigatório" }, 400);
  }
  if (!input.check_in_at || !input.check_out_at) {
    return jsonResponse({ error: "check_in_at e check_out_at são obrigatórios" }, 400);
  }

  // Service role pra executar o RPC com privilégios (SECURITY DEFINER já cobre)
  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin.rpc("create_booking_atomic", {
    p_profile_id: profileId,
    p_location_parking_type_id: input.location_parking_type_id,
    p_check_in_at: input.check_in_at,
    p_check_out_at: input.check_out_at,
    p_passenger_count: input.passenger_count ?? null,
    p_has_pcd: input.has_pcd ?? false,
    p_vehicle_id: input.vehicle_id ?? null,
    p_add_on_ids: input.add_on_service_ids ?? null,
    p_coupon_code: input.coupon_code ?? null,
    p_origin: input.origin ?? null,
  });

  if (error) {
    // Erros lançados pelo plpgsql vêm aqui (mensagens em PT-BR já)
    return jsonResponse({ error: error.message }, 400);
  }

  // Atribuição (E2.4.1): grava os UTMs na reserva recém-criada. Best-effort — não bloqueia.
  const bookingId = (data as { booking_id?: string })?.booking_id;
  if (bookingId && (input.utm_source || input.utm_medium || input.utm_campaign)) {
    const { error: utmErr } = await admin
      .from("booking")
      .update({
        utm_source: input.utm_source ?? null,
        utm_medium: input.utm_medium ?? null,
        utm_campaign: input.utm_campaign ?? null,
      })
      .eq("id", bookingId);
    if (utmErr) console.error("utm update falhou:", utmErr.message);
  }

  // O push Hub→WL (reserve) é enfileirado pelo trigger booking_item_wl_reserve → outbox wl_delivery
  // → Edge wl-deliver (E2.5.2, confiável com retry). Nada inline aqui.

  return jsonResponse(data, 201);
});
