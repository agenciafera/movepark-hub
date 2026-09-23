// Edge Function: /change-booking-dates
// Altera as datas de uma reserva PENDENTE (E2.8-f Frente B). Gateado pelo benefício da Tarifa
// `date_change` (Flex+); staff faz override. A RPC change_booking_dates re-segura capacidade e
// re-precifica; reserva paga é recusada (oriente cancelar+refazer). Dono ou staff.
//
// POST /functions/v1/change-booking-dates
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXX", "check_in_at": "...ISO...", "check_out_at": "...ISO..." }
// → { booking_id, days, total_amount }

import { notifyBooking } from "../_shared/notify.ts";
import { tplBookingDatesChanged } from "../_shared/email.ts";
import { siteUrl } from "../_shared/site.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dateChangeAllowed, parseChangeDatesInput } from "./logic.ts";

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
    .select(
      "id, status, profile_id, fare_benefits, check_in_at, check_out_at, location:location!inner(company_id)",
    )
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
  if (!dateChangeAllowed(benefits, isStaff)) {
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

  // Histórico (best-effort). `data.total_amount` vem da RPC re-precificada.
  await admin
    .rpc("log_booking_modification", {
      p_booking_id: booking.id,
      p_type: "date_change",
      p_actor_id: userId,
      p_actor_role: isStaff ? "staff" : "customer",
      p_changes: {
        from: { check_in_at: booking.check_in_at, check_out_at: booking.check_out_at },
        to: { check_in_at: input.checkInAt, check_out_at: input.checkOutAt },
      },
      p_amount_delta_cents: null,
      p_reason: null,
    })
    .then(({ error: logErr }) => {
      if (logErr) console.error("[change-booking-dates] log_booking_modification:", logErr.message);
    });

  // Aviso ao cliente (fase 2 da tarifas-operacao): WhatsApp com o benefício, senão e-mail.
  const nd = await noticeData(admin, booking.id);
  if (nd) {
    const quando = `${fmtBR(nd.check_in_at)} a ${fmtBR(nd.check_out_at)}`;
    await notifyBooking(admin, {
      bookingId: booking.id,
      event: "dates_changed",
      whatsappParams: (c) => [c.name ?? "cliente", nd.code, quando],
      email: (c) => tplBookingDatesChanged(nd, c.name, `${siteUrl()}/bookings/${nd.code}`),
    });
  }

  return jsonResponse(data, 200);
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

function fmtBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

