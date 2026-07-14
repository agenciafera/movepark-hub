// Edge Function: /api  — Gateway da Public API (E0.7). Ver docs/specs/public-api.md.
// Autentica por CHAVE DE API (Bearer mp_live_… / X-API-Key), resolve company + escopos
// (api_key_verify), checa o escopo do endpoint e despacha para as RPCs api_* (tenant-scoped).
// Servido externamente em https://api.movepark.co/v1/* (proxy Cloudflare Worker — src/api-worker.ts).
//
// Superfície v1 (escopo entre parênteses):
//   GET  /v1/locations                         (locations:read)
//   GET  /v1/locations/{id}                     (locations:read)
//   GET  /v1/locations/{id}/parking-types       (parking-types:read)
//   GET  /v1/availability?location_parking_type_id&from&to   (availability:read)
//   POST /v1/pricing/simulate                   (pricing:read)
//   GET  /v1/bookings                           (bookings:read)
//   GET  /v1/bookings/{id}                       (bookings:read)
//   POST /v1/bookings                           (bookings:write)   [Idempotency-Key]
//   POST /v1/bookings/{id}/cancel                (bookings:cancel)
//   POST /v1/bookings/{id}/check-in|check-out    (bookings:checkin)
//   POST /v1/wps/events                          (wps:write)   [pátio: entrada/saída de veículo]
//   GET  /v1/faq                                 (faq:read)
//
// Erros: { error: { code, message, request_id } }. Sucesso: { data, meta:{request_id} }.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractApiKey, hasScope, keyPrefix, sha256Hex } from "./auth.ts";
import { matchRoute, normalizePath, pathExists } from "./router.ts";
import { corsHeaders, fail, ok, pgErrorToHttp } from "./respond.ts";
import { parseWpsEvent } from "./wps.logic.ts";

// request id curto sem dependências externas
function newRequestId(): string {
  return "req_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

interface AuthCtx {
  api_key_id: string;
  company_id: string;
  environment: string;
  scopes: string[];
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  const requestId = req.headers.get("x-request-id") ?? newRequestId();
  const started = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const path = normalizePath(url.pathname);

  // health check público
  if (path === "/v1" || path === "/v1/" || path === "/v1/health") {
    return ok({ status: "ok", service: "movepark-public-api", version: "v1" }, requestId);
  }

  const route = matchRoute(req.method, url.pathname);
  if (!route) {
    if (pathExists(url.pathname)) {
      return fail("method_not_allowed", "Método não permitido para esse recurso.", 405, requestId);
    }
    return fail("not_found", "Recurso não encontrado.", 404, requestId);
  }

  // 1) autenticação por chave
  const key = extractApiKey(req.headers);
  if (!key) {
    return fail("unauthorized", "Chave de API ausente. Use Authorization: Bearer mp_live_…", 401, requestId);
  }

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const hash = await sha256Hex(key);
  const { data: verify, error: verifyErr } = await admin.rpc("api_key_verify", {
    p_key_prefix: keyPrefix(key),
    p_key_hash: hash,
  });
  if (verifyErr) {
    return fail("internal", "Falha ao verificar a chave.", 500, requestId);
  }
  if (!verify || verify.ok !== true) {
    const reason = verify?.reason ?? "invalid_key";
    return fail("unauthorized", `Chave inválida (${reason}).`, 401, requestId);
  }
  const ctx: AuthCtx = {
    api_key_id: verify.api_key_id,
    company_id: verify.company_id,
    environment: verify.environment,
    scopes: verify.scopes ?? [],
  };

  // 2) checagem de escopo
  let resp: Response;
  if (!hasScope(ctx.scopes, route.scope)) {
    resp = fail("insufficient_scope", `Esta chave não tem o escopo "${route.scope}".`, 403, requestId);
  } else {
    // 3) corpo (mutações)
    let body: Record<string, unknown> = {};
    let badJson = false;
    if (req.method === "POST") {
      try {
        const txt = await req.text();
        body = txt ? JSON.parse(txt) : {};
      } catch {
        badJson = true;
      }
    }
    if (badJson) {
      resp = fail("validation_error", "JSON inválido.", 422, requestId);
    } else {
      // 4) dispatch
      try {
        resp = await dispatch(route.handler, { admin, ctx, url, params: route.params, body, req, requestId });
      } catch (e) {
        const pg = pgErrorToHttp({ code: (e as { code?: string }).code, message: (e as Error).message });
        resp = fail(pg.code, pg.message, pg.status, requestId);
      }
    }
  }

  // 5) auditoria (Fase 1.1) — não bloqueia a resposta
  background(
    logRequest(admin, {
      api_key_id: ctx.api_key_id,
      company_id: ctx.company_id,
      surface: "rest",
      method: req.method,
      path: normalizePath(url.pathname),
      scope: route.scope,
      status: resp.status,
      request_id: requestId,
      ip: clientIp(req),
      latency_ms: Date.now() - started,
    }),
  );
  return resp;
});

interface Dispatch {
  // deno-lint-ignore no-explicit-any
  admin: any;
  ctx: AuthCtx;
  url: URL;
  params: Record<string, string>;
  body: Record<string, unknown>;
  req: Request;
  requestId: string;
}

async function dispatch(handler: string, d: Dispatch): Promise<Response> {
  const { admin, ctx, url, params, body, req, requestId } = d;
  const q = url.searchParams;
  const company = ctx.company_id;

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw error;
    return data;
  };

  switch (handler) {
    case "list_locations":
      return ok(
        await call("api_list_locations", {
          p_company_id: company,
          p_limit: intParam(q.get("limit"), 20),
          p_offset: intParam(q.get("offset"), 0),
        }),
        requestId,
      );

    case "get_location":
      return ok(await call("api_get_location", { p_company_id: company, p_location_id: params.id }), requestId);

    case "list_parking_types":
      return ok(
        await call("api_list_parking_types", { p_company_id: company, p_location_id: params.id }),
        requestId,
      );

    case "availability": {
      const lpt = q.get("location_parking_type_id");
      const from = q.get("from");
      const to = q.get("to");
      if (!lpt || !from || !to) {
        return fail("validation_error", "Parâmetros obrigatórios: location_parking_type_id, from, to.", 422, requestId);
      }
      await call("api_assert_lpt_company", { p_company_id: company, p_lpt_id: lpt });
      const rows = await call("availability_batch", {
        p_lpt_ids: [lpt],
        p_check_in_at: from,
        p_check_out_at: to,
      });
      return ok(Array.isArray(rows) ? rows[0] ?? null : rows, requestId);
    }

    case "simulate_price": {
      const lpt = body.location_parking_type_id as string | undefined;
      if (!lpt) return fail("validation_error", "location_parking_type_id é obrigatório.", 422, requestId);
      const data = await call("api_simulate_price", {
        p_company_id: company,
        p_location_parking_type_id: lpt,
        p_days: Number(body.days ?? 1),
      });
      return ok(data, requestId);
    }

    case "list_bookings":
      return ok(
        await call("api_list_bookings", {
          p_company_id: company,
          p_status: q.get("status"),
          p_from: q.get("from"),
          p_to: q.get("to"),
          p_limit: intParam(q.get("limit"), 20),
          p_offset: intParam(q.get("offset"), 0),
        }),
        requestId,
      );

    case "get_booking":
      return ok(await call("api_get_booking", { p_company_id: company, p_booking_id: params.id }), requestId);

    case "create_booking": {
      const lpt = body.location_parking_type_id as string | undefined;
      if (!lpt || !body.check_in_at || !body.check_out_at) {
        return fail("validation_error", "location_parking_type_id, check_in_at e check_out_at são obrigatórios.", 422, requestId);
      }
      const data = await call("api_create_booking", {
        p_company_id: company,
        p_api_key_id: ctx.api_key_id,
        p_location_parking_type_id: lpt,
        p_check_in_at: body.check_in_at,
        p_check_out_at: body.check_out_at,
        p_customer_name: (body.customer_name as string) ?? null,
        p_customer_email: (body.customer_email as string) ?? null,
        p_customer_phone: (body.customer_phone as string) ?? null,
        p_passenger_count: (body.passenger_count as number) ?? null,
        p_has_pcd: (body.has_pcd as boolean) ?? false,
        p_add_on_ids: (body.add_on_service_ids as string[]) ?? null,
        p_coupon_code: (body.coupon_code as string) ?? null,
        p_idempotency_key: req.headers.get("Idempotency-Key"),
        p_origin: (body.origin as string) ?? "api",
      });
      return ok(data, requestId, 201);
    }

    case "cancel_booking":
      return ok(
        await call("api_cancel_booking", {
          p_company_id: company,
          p_booking_id: params.id,
          p_reason: (body.reason as string) ?? null,
        }),
        requestId,
      );

    case "checkin_booking":
      return ok(await call("api_checkin_booking", { p_company_id: company, p_booking_id: params.id }), requestId);

    case "checkout_booking":
      return ok(await call("api_checkout_booking", { p_company_id: company, p_booking_id: params.id }), requestId);

    case "change_dates": {
      if (!body.check_in_at || !body.check_out_at) {
        return fail("validation_error", "check_in_at e check_out_at são obrigatórios.", 422, requestId);
      }
      return ok(
        await call("api_change_booking_dates", {
          p_company_id: company,
          p_booking_id: params.id,
          p_check_in: body.check_in_at,
          p_check_out: body.check_out_at,
        }),
        requestId,
      );
    }

    case "wps_event": {
      const parsed = parseWpsEvent(body);
      if (!parsed.ok) return fail("validation_error", parsed.error, 422, requestId);
      const ev = parsed.value;
      return ok(
        await call("api_wps_event", {
          p_company_id: company,
          p_external_event_id: ev.event_id,
          p_type: ev.type,
          p_location_ref: ev.location_ref,
          p_plate: ev.plate,
          p_booking_code: ev.booking_code,
          p_occurred_at: ev.occurred_at ?? new Date().toISOString(),
        }),
        requestId,
      );
    }

    case "faq": {
      const { data, error } = await admin.functions.invoke("get-faq", {
        body: { location_id: q.get("location_id"), query: q.get("query"), limit: intParam(q.get("limit"), 20) },
      });
      if (error) throw error;
      return ok(data, requestId);
    }

    // ── Promoções: cupons ────────────────────────────────────────────────
    case "list_coupons":
      return ok(await call("api_list_coupons", { p_company_id: company }), requestId);
    case "upsert_coupon":
      return ok(
        await call("api_upsert_coupon", {
          p_company_id: company,
          p_id: (body.id as string) ?? null,
          p_code: body.code,
          p_description: (body.description as string) ?? null,
          p_discount_type: body.discount_type ?? "percent",
          p_discount_value: body.discount_value ?? 0,
          p_valid_from: (body.valid_from as string) ?? null,
          p_valid_until: (body.valid_until as string) ?? null,
          p_max_uses: (body.max_uses as number) ?? null,
          p_is_active: (body.is_active as boolean) ?? true,
          p_sort_order: (body.sort_order as number) ?? 0,
          p_per_user_limit: (body.per_user_limit as number) ?? null,
          p_min_amount: (body.min_amount as number) ?? null,
          p_min_days: (body.min_days as number) ?? null,
          p_parking_type_ids: (body.parking_type_ids as string[]) ?? null,
        }),
        requestId,
        201,
      );
    case "set_coupon_active":
      return ok(
        await call("api_set_coupon_active", { p_company_id: company, p_coupon_id: params.id, p_is_active: body.is_active }),
        requestId,
      );
    case "delete_coupon":
      return ok(await call("api_delete_coupon", { p_company_id: company, p_coupon_id: params.id }), requestId);

    // ── Promoções: descontos ─────────────────────────────────────────────
    case "list_discounts":
      return ok(await call("api_list_discounts", { p_company_id: company }), requestId);
    case "upsert_discount":
      return ok(
        await call("api_upsert_discount", {
          p_company_id: company,
          p_id: (body.id as string) ?? null,
          p_location_id: (body.location_id as string) ?? null,
          p_name: body.name,
          p_description: (body.description as string) ?? null,
          p_discount_type: body.discount_type ?? "percent",
          p_discount_value: body.discount_value ?? 0,
          p_valid_from: (body.valid_from as string) ?? null,
          p_valid_until: (body.valid_until as string) ?? null,
          p_min_days: (body.min_days as number) ?? null,
          p_min_amount: (body.min_amount as number) ?? null,
          p_advance_days: (body.advance_days as number) ?? null,
          p_allow_coupon_stack: (body.allow_coupon_stack as boolean) ?? true,
          p_priority: (body.priority as number) ?? 0,
          p_is_active: (body.is_active as boolean) ?? true,
          p_sort_order: (body.sort_order as number) ?? 0,
          p_parking_type_ids: (body.parking_type_ids as string[]) ?? null,
        }),
        requestId,
        201,
      );
    case "set_discount_active":
      return ok(
        await call("api_set_discount_active", { p_company_id: company, p_discount_rule_id: params.id, p_is_active: body.is_active }),
        requestId,
      );
    case "delete_discount":
      return ok(await call("api_delete_discount", { p_company_id: company, p_discount_rule_id: params.id }), requestId);

    // ── Serviços adicionais ──────────────────────────────────────────────
    case "list_addons":
      return ok(await call("api_list_addons", { p_company_id: company }), requestId);
    case "upsert_addon":
      return ok(
        await call("api_upsert_addon", {
          p_company_id: company,
          p_id: (body.id as string) ?? null,
          p_code: (body.code as string) ?? null,
          p_name: body.name,
          p_description: (body.description as string) ?? null,
          p_base_price: body.base_price ?? 0,
          p_is_active: (body.is_active as boolean) ?? true,
          p_sort_order: (body.sort_order as number) ?? 0,
        }),
        requestId,
        201,
      );
    case "set_location_addon":
      return ok(
        await call("api_set_location_addon", {
          p_company_id: company,
          p_add_on_service_id: params.id,
          p_location_id: body.location_id,
          p_is_active: body.is_active ?? false,
          p_price_override: (body.price_override as number) ?? null,
        }),
        requestId,
      );
    case "delete_addon":
      return ok(await call("api_delete_addon", { p_company_id: company, p_add_on_service_id: params.id }), requestId);

    // ── Avaliações ───────────────────────────────────────────────────────
    case "list_reviews":
      return ok(await call("api_list_reviews", { p_company_id: company, p_limit: intParam(q.get("limit"), 50) }), requestId);
    case "respond_review":
      return ok(
        await call("api_respond_review", { p_company_id: company, p_review_id: params.id, p_response: (body.response as string) ?? null }),
        requestId,
      );

    // ── Ocupação ─────────────────────────────────────────────────────────
    case "occupancy": {
      const loc = q.get("location_id");
      const from = q.get("from");
      const to = q.get("to");
      if (!loc || !from || !to) {
        return fail("validation_error", "Parâmetros obrigatórios: location_id, from, to.", 422, requestId);
      }
      return ok(await call("api_location_occupancy", { p_company_id: company, p_location_id: loc, p_from: from, p_to: to }), requestId);
    }

    // ── Escritas ─────────────────────────────────────────────────────────
    case "update_location":
      return ok(
        await call("api_update_location", {
          p_company_id: company,
          p_location_id: params.id,
          p_name: (body.name as string) ?? null,
          p_address: (body.address as string) ?? null,
          p_phone: (body.phone as string) ?? null,
          p_email: (body.email as string) ?? null,
          p_reservation_policy: (body.reservation_policy as string) ?? null,
          p_has_notice: (body.has_notice as boolean) ?? null,
          p_notice: (body.notice as string) ?? null,
        }),
        requestId,
      );
    case "update_parking_type":
      return ok(
        await call("api_update_parking_type", {
          p_company_id: company,
          p_location_parking_type_id: params.id,
          p_is_active: (body.is_active as boolean) ?? null,
          p_capacity: (body.capacity as number) ?? null,
          p_near_capacity_threshold: (body.near_capacity_threshold as number) ?? null,
          p_near_capacity_message: (body.near_capacity_message as string) ?? null,
          p_has_minimum_stay: (body.has_minimum_stay as boolean) ?? null,
          p_minimum_stay_value: (body.minimum_stay_value as number) ?? null,
          p_minimum_stay_unit: (body.minimum_stay_unit as string) ?? null,
          p_has_minimum_date: (body.has_minimum_date as boolean) ?? null,
          p_minimum_date: (body.minimum_date as string) ?? null,
        }),
        requestId,
      );

    // ── Precificação (E1.4.1) e bloqueio de datas (E1.4.2) ───────────────
    case "set_pricing":
      return ok(
        await call("api_set_pricing", {
          p_company_id: company,
          p_location_parking_type_id: params.id,
          p_base_price: (body.base_price as number) ?? null,
          p_rule: body.rule ?? {},
          p_tiers: body.tiers ?? [],
        }),
        requestId,
      );
    case "set_date_blocked": {
      if (!body.date || typeof body.blocked !== "boolean") {
        return fail("validation_error", "date (YYYY-MM-DD) e blocked (boolean) são obrigatórios.", 422, requestId);
      }
      return ok(
        await call("api_set_date_blocked", {
          p_company_id: company,
          p_location_parking_type_id: params.id,
          p_date: body.date,
          p_blocked: body.blocked,
        }),
        requestId,
      );
    }

    default:
      return fail("not_found", "Handler desconhecido.", 404, requestId);
  }
}

function intParam(v: string | null, fallback: number): number {
  const n = v == null ? NaN : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ── Auditoria (Fase 1.1) ─────────────────────────────────────────────────────
export interface ApiLogRow {
  api_key_id: string;
  company_id: string;
  surface: "rest" | "mcp";
  method: string;
  path: string;
  scope: string | null;
  status: number;
  request_id: string;
  ip: string | null;
  latency_ms: number;
}

export function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

// Insere o log de uso (service_role bypassa RLS). Best-effort.
// deno-lint-ignore no-explicit-any
export async function logRequest(admin: any, row: ApiLogRow): Promise<void> {
  try {
    await admin.from("api_request_log").insert(row);
  } catch {
    // auditoria nunca derruba a request
  }
}

// Executa em background (não bloqueia a resposta) quando o runtime suporta.
export function background(p: Promise<unknown>): void {
  const safe = p.catch(() => {});
  try {
    // @ts-expect-error - EdgeRuntime é global no Supabase Edge
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-expect-error - idem
      EdgeRuntime.waitUntil(safe);
    }
  } catch {
    // fallback: fire-and-forget (safe já trata rejeições)
  }
}
