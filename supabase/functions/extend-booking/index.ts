// Edge Function: /extend-booking
// Auto-extensão por atraso de voo (benefício Superflex, E2.8-e). Estende check_out_at SEM cobrança,
// re-segurando capacidade — toda a regra (Superflex, status, disponibilidade) mora na RPC
// server-authoritative `extend_booking_flight_delay`. Notifica por WhatsApp (best-effort).
//
// Autorização: dono da reserva (cliente) OU staff (hub_admin / company_operator da empresa).
//
// POST /functions/v1/extend-booking
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXX", "new_check_out_at": "2026-12-13T08:00:00Z", "flight_number": "LA3456", "reason"?: "voo atrasado" }
// Limites (23/09/2026, Q-025 a Q-027): até 24h depois da saída, uma vez por reserva, até 120 min
// depois da saída prevista; a diária extra vira crédito ao parceiro, pago pela Movepark.
// → { booking_id, old_check_out_at, new_check_out_at, added_days }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyBooking } from "../_shared/notify.ts";
import { tplBookingExtended } from "../_shared/email.ts";
import { siteUrl } from "../_shared/site.ts";
import { parseExtendInput } from "./logic.ts";

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
  const { input, error: inputErr } = parseExtendInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Reserva + empresa (via location) + dados de notificação.
  const { data: booking, error: bErr } = await admin
    .from("booking")
    .select(
      "id, code, profile_id, customer_name, customer_phone, fare_benefits, location:location!inner(company_id)",
    )
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  if (!booking) return jsonResponse({ error: "Reserva não encontrada." }, 404);

  // deno-lint-ignore no-explicit-any
  const companyId = (booking as any).location?.company_id as string | undefined;

  // Autorização: dono (customer) ou staff (hub_admin / operador da empresa).
  let actor: "customer" | "staff" | null = null;
  if (booking.profile_id === userId) {
    actor = "customer";
  } else {
    const { data: caller } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (caller?.role === "hub_admin") {
      actor = "staff";
    } else if (caller?.role === "company_operator" && companyId) {
      const { data: membership } = await admin
        .from("profile_company")
        .select("company_id")
        .eq("profile_id", userId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (membership) actor = "staff";
    }
  }
  if (!actor) return jsonResponse({ error: "Sem permissão para alterar esta reserva." }, 403);

  // Server-authoritative: a RPC valida Superflex, status, datas e re-segura capacidade.
  const { data: result, error: rpcErr } = await admin.rpc("extend_booking_flight_delay", {
    p_booking_id: booking.id,
    p_new_check_out_at: input.newCheckOutAt,
    p_actor: actor,
    p_reason: input.reason,
    p_flight_number: input.flightNumber,
  });
  if (rpcErr) return jsonResponse({ error: rpcErr.message }, 400);

  // Aviso da nova saída (WhatsApp com o benefício, senão e-mail). Best-effort.
  const nd = await noticeData(admin, booking.id);
  if (nd) {
    const newOut = new Date(nd.check_out_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    await notifyBooking(admin, {
      bookingId: booking.id,
      event: "extended",
      whatsappParams: (c) => [c.name ?? "cliente", nd.code, newOut],
      email: (c) => tplBookingExtended(nd, c.name, `${siteUrl()}/bookings/${nd.code}`),
    });
  }

  return jsonResponse(result, 200);
});

/** Dados da reserva para os avisos (unidade, datas, veículo). */
// deno-lint-ignore no-explicit-any
async function noticeData(admin: any, bookingId: string) {
  const { data: r } = await admin
    .from("booking")
    .select("code, check_in_at, check_out_at, location:location!inner(name, address), vehicle:vehicle(license_plate, model)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!r) return null;
  return { code: r.code, location_name: r.location?.name ?? "", location_address: r.location?.address ?? null, check_in_at: r.check_in_at, check_out_at: r.check_out_at, vehicle: r.vehicle ?? null };
}
