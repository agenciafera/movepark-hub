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
//   GET  /v1/faq                                 (faq:read)
//
// Erros: { error: { code, message, request_id } }. Sucesso: { data, meta:{request_id} }.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractApiKey, hasScope, keyPrefix, sha256Hex } from "./auth.ts";
import { matchRoute, normalizePath, pathExists } from "./router.ts";
import { corsHeaders, fail, ok, pgErrorToHttp } from "./respond.ts";

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
  if (!hasScope(ctx.scopes, route.scope)) {
    return fail("insufficient_scope", `Esta chave não tem o escopo "${route.scope}".`, 403, requestId);
  }

  // 3) corpo (mutações)
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      const txt = await req.text();
      body = txt ? JSON.parse(txt) : {};
    } catch {
      return fail("validation_error", "JSON inválido.", 422, requestId);
    }
  }

  // 4) dispatch
  try {
    return await dispatch(route.handler, { admin, ctx, url, params: route.params, body, req, requestId });
  } catch (e) {
    const pg = pgErrorToHttp({ code: (e as { code?: string }).code, message: (e as Error).message });
    return fail(pg.code, pg.message, pg.status, requestId);
  }
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

    case "faq": {
      const { data, error } = await admin.functions.invoke("get-faq", {
        body: { location_id: q.get("location_id"), query: q.get("query"), limit: intParam(q.get("limit"), 20) },
      });
      if (error) throw error;
      return ok(data, requestId);
    }

    default:
      return fail("not_found", "Handler desconhecido.", 404, requestId);
  }
}

function intParam(v: string | null, fallback: number): number {
  const n = v == null ? NaN : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
