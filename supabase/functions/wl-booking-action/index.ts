// Edge Function: /wl-booking-action
// O parceiro opera, pelo painel do Hub, uma reserva que o próprio site white-label vendeu:
// marcar que o cliente chegou (check-in), que não veio (no-show) ou trocar a placa
// (docs/specs/reservas-wl-no-hub.md § 10). A ação grava no legado (rotas do PR
// agenciafera/movepark-backoffice#615) e se reflete na linha local de `wl_booking`.
//
// Por que Edge: o token de backend do legado vale para todos os tenants e não pode ir ao navegador.
// A permissão é conferida com o JWT de quem clicou (RPC `wl_booking_action_context`: check-in e
// no-show exigem bookings:checkin, troca de placa exige bookings:write). Toda tentativa, aceita ou
// recusada, deixa linha em `wl_booking_action_log`.
//
// verify_jwt = true (padrão): só usuário logado chama.
//
// POST /functions/v1/wl-booking-action
// { action: "attendance", wl_booking_id, status: "pendente" | "compareceu" | "no_show" }
// { action: "license_plate", wl_booking_id, license_plate, reason, brand?, model?, color? }
// → 200 { ok: true, ... }  |  4xx { error }  (mensagem pronta para a tela)

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  wlChangeLicensePlate,
  wlErrorStatus,
  wlMarkAttendance,
  type WlActionResult,
  type WlConfig,
} from "../_shared/wl/client.ts";
import { contextRefusal, legacyRefusalMessage, parseInput } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Faça login de novo." }, 401);

  const parsed = parseInput(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 422);
  const input = parsed.input;

  // @ts-expect-error - Deno env
  const url = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // Permissão com o JWT de quem clicou. O servidor decide; a tela só espelha.
  const { data: ctx, error: ctxErr } = await userClient.rpc("wl_booking_action_context", {
    p_wl_booking_id: input.wl_booking_id,
    p_action: input.action,
  });
  if (ctxErr) return json({ error: "Faça login de novo." }, 401);
  // deno-lint-ignore no-explicit-any
  const c = ctx as any;
  if (!c?.ok) {
    const r = contextRefusal(String(c?.reason ?? ""));
    return json({ error: r.error }, r.status);
  }

  // @ts-expect-error - Deno env
  const token = Deno.env.get("WL_BACKEND_TOKEN");
  if (!token) return json({ error: "Integração com o site indisponível no momento." }, 503);

  const cfg: WlConfig = { wl_domain: c.wl_domain, wl_tenant_key: c.wl_tenant_key, wl_sync_enabled: true };
  const request =
    input.action === "attendance"
      ? { status: input.status }
      : {
        license_plate: input.license_plate,
        reason: input.reason,
        brand: input.brand,
        model: input.model,
        color: input.color,
      };

  let result: WlActionResult;
  try {
    result = input.action === "attendance"
      ? await wlMarkAttendance(cfg, token, { orderNumber: c.wl_order_number, status: input.status, actor: c.actor })
      : await wlChangeLicensePlate(cfg, token, {
        orderNumber: c.wl_order_number,
        licensePlate: input.license_plate,
        reason: input.reason,
        brand: input.brand,
        model: input.model,
        color: input.color,
        actor: c.actor,
      });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.rpc("wl_booking_record_action", {
      p_wl_booking_id: input.wl_booking_id,
      p_action: input.action,
      p_request: request,
      p_requested_by: c.profile_id,
      p_http_status: wlErrorStatus(e),
      p_result: "error",
      p_result_code: null,
      p_message: message,
    });
    return json({ error: "Não conseguimos falar com o seu site agora. Tente de novo em instantes." }, 502);
  }

  if (result.kind === "refused") {
    const message = legacyRefusalMessage(result.code);
    await admin.rpc("wl_booking_record_action", {
      p_wl_booking_id: input.wl_booking_id,
      p_action: input.action,
      p_request: request,
      p_requested_by: c.profile_id,
      p_http_status: result.status,
      p_result: "refused",
      p_result_code: result.code,
      p_message: result.message || message,
    });
    return json({ error: message, code: result.code }, 409);
  }

  const data = result.data;
  await admin.rpc("wl_booking_record_action", {
    p_wl_booking_id: input.wl_booking_id,
    p_action: input.action,
    p_request: request,
    p_requested_by: c.profile_id,
    p_http_status: result.status,
    p_result: "ok",
    p_result_code: null,
    p_message: null,
    p_attendance_status: input.action === "attendance" ? String(data.attendance_status ?? input.status) : null,
    p_license_plate: input.action === "license_plate" ? String(data.license_plate ?? "") || null : null,
  });

  return json({ ok: true, ...data });
});
