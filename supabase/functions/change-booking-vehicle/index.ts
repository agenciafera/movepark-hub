// Edge Function: /change-booking-vehicle
// Troca o veículo/placa de uma reserva (E2.8-f Frente B / E2.8-c). Gateado pelo benefício da Tarifa
// `plate_change` (Flex+). Resolve a dor do white-label que não permite trocar placa: registramos do
// NOSSO lado e regeneramos o voucher. Dono (cliente) ou staff (hub_admin / operador da empresa).
//
// POST /functions/v1/change-booking-vehicle
// Authorization: Bearer <JWT>
// { "booking_code": "MP-XXXX", "vehicle_id": "uuid" }
// → { ok: true, vehicle_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAndStoreVoucher } from "../_shared/voucher/pdf.ts";
import { parseChangeVehicleInput, plateChangeAllowed } from "./logic.ts";

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
  const { input, error: inputErr } = parseChangeVehicleInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const { data: booking, error: bErr } = await admin
    .from("booking")
    .select("id, code, status, profile_id, fare_benefits, location:location!inner(company_id)")
    .eq("code", input.bookingCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr) return jsonResponse({ error: bErr.message }, 500);
  if (!booking) return jsonResponse({ error: "Reserva não encontrada." }, 404);

  // Autorização: dono ou staff (hub_admin / operador da empresa).
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

  // Regra da Tarifa: troca de placa é benefício Flex+ (cliente). Staff faz override.
  // deno-lint-ignore no-explicit-any
  const benefits = (booking.fare_benefits ?? {}) as Record<string, any>;
  if (!plateChangeAllowed(benefits, isStaff)) {
    return jsonResponse(
      { error: "Sua Tarifa não permite trocar o veículo. Faça upgrade para Flex ou Superflex." },
      403,
    );
  }
  if (!["pending", "confirmed"].includes(booking.status)) {
    return jsonResponse({ error: "Esta reserva não permite troca de veículo." }, 400);
  }

  // Resolve o veículo alvo: por id (veículo já cadastrado do cliente) ou por placa (staff digita).
  let targetVehicleId: string;
  if (input.vehicleId) {
    const { data: v } = await admin
      .from("vehicle")
      .select("id, profile_id")
      .eq("id", input.vehicleId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!v) return jsonResponse({ error: "Veículo não encontrado." }, 404);
    if (booking.profile_id && v.profile_id !== booking.profile_id) {
      return jsonResponse({ error: "O veículo não pertence ao titular da reserva." }, 403);
    }
    targetVehicleId = v.id;
  } else {
    // Caminho por placa: cria/acha o veículo do titular. Precisa de uma reserva com titular.
    if (!booking.profile_id) {
      return jsonResponse({ error: "Reserva sem titular; não dá pra cadastrar a placa." }, 422);
    }
    const plate = input.licensePlate!;
    const { data: existing } = await admin
      .from("vehicle")
      .select("id")
      .eq("profile_id", booking.profile_id)
      .eq("license_plate", plate)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      targetVehicleId = existing.id;
    } else {
      const { data: created, error: cErr } = await admin
        .from("vehicle")
        .insert({ profile_id: booking.profile_id, license_plate: plate })
        .select("id")
        .single();
      if (cErr || !created) return jsonResponse({ error: cErr?.message ?? "Falha ao cadastrar veículo." }, 500);
      targetVehicleId = created.id;
    }
  }

  const { error: upErr } = await admin
    .from("booking")
    .update({ vehicle_id: targetVehicleId })
    .eq("id", booking.id);
  if (upErr) return jsonResponse({ error: upErr.message }, 500);

  // Regenera o voucher (a placa está no PDF) — best-effort, não bloqueia a resposta.
  if (booking.status === "confirmed") {
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "https://hub.movepark.co";
    // @ts-ignore - EdgeRuntime no runtime do Supabase
    const waitUntil = typeof EdgeRuntime !== "undefined" ? EdgeRuntime?.waitUntil : undefined;
    const task = generateAndStoreVoucher(admin, booking.id, siteUrl).catch((e) =>
      console.error("[change-booking-vehicle] falha ao regenerar voucher:", booking.id, e),
    );
    if (typeof waitUntil === "function") waitUntil(task);
    else await task;
  }

  return jsonResponse({ ok: true, vehicle_id: targetVehicleId });
});
