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
import {
  decidirUtm,
  montarArgsRpc,
  validarEntrada,
  type CreateBookingInput,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  const validacao = validarEntrada(input);
  if (!validacao.ok) {
    return jsonResponse({ error: validacao.erro }, validacao.status);
  }

  // Service role pra executar o RPC com privilégios (SECURITY DEFINER já cobre)
  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin.rpc(
    "create_booking_atomic",
    montarArgsRpc(profileId, input),
  );

  if (error) {
    // Erros lançados pelo plpgsql vêm aqui (mensagens em PT-BR já)
    return jsonResponse({ error: error.message }, 400);
  }

  // Atribuição (E2.4.1): grava os UTMs na reserva recém-criada. Best-effort — não bloqueia.
  const bookingId = (data as { booking_id?: string })?.booking_id;
  const utm = decidirUtm(bookingId, input);
  if (utm.gravar) {
    const { error: utmErr } = await admin
      .from("booking")
      .update(utm.patch)
      .eq("id", bookingId!);
    if (utmErr) console.error("utm update falhou:", utmErr.message);
  }

  // O push Hub→WL (reserve) é enfileirado pelo trigger booking_item_wl_reserve → outbox wl_delivery
  // → Edge wl-deliver (E2.5.2, confiável com retry). Nada inline aqui.

  return jsonResponse(data, 201);
});
