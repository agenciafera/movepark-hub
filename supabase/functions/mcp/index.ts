// Edge Function: /mcp  — Servidor MCP (Model Context Protocol) do Movepark (E0.7 Fase 2).
// Streamable HTTP / JSON-RPC 2.0, stateless. Duas superfícies pelo path:
//   /mcp  ou /mcp/public   → CONSUMIDOR (anon): descoberta — buscar estacionamento,
//                            simular preço, FAQ, listar empresas/unidades, tipos de vaga.
//   /mcp/partner           → PARCEIRO (Authorization: Bearer mp_…): tools tenant-scoped
//                            sobre a API v1 (escopos da chave), reusa RPCs api_* + api_key_verify.
// Servido externamente em https://mcp.movepark.co (proxy Cloudflare Worker — src/api-worker.ts).
// Ver docs/specs/mcp.md. server-card: /.well-known/mcp/server-card.json (+ partner-card.json).

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  initializeResult,
  isJsonRpcRequest,
  isNotification,
  JSONRPC,
  type JsonRpcId,
  type JsonRpcRequest,
  rpcError,
  rpcResult,
  toolTextContent,
} from "./protocol.ts";
import { findTool, isToolCallable, listTools, missingRequired, type Endpoint } from "./tools.ts";
import { extractApiKey, keyPrefix, sha256Hex } from "./auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function env(k: string): string {
  // @ts-expect-error - Deno env
  return Deno.env.get(k)!;
}

interface PartnerCtx {
  api_key_id: string;
  company_id: string;
  scopes: string[];
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  const started = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const endpoint: Endpoint = url.pathname.includes("/partner") ? "partner" : "public";

  // Probe simples por GET (clientes/healthcheck)
  if (req.method === "GET") {
    return json({ service: "movepark-mcp", endpoint, transport: "streamable-http" });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(rpcError(null, JSONRPC.PARSE_ERROR, "JSON inválido."), 400);
  }
  if (!isJsonRpcRequest(payload)) {
    return json(rpcError(null, JSONRPC.INVALID_REQUEST, "Requisição JSON-RPC inválida."), 400);
  }
  const reqMsg = payload as JsonRpcRequest;
  const id: JsonRpcId = reqMsg.id ?? null;

  // Autenticação (só parceiro). Header sempre presente no transporte; validamos a chave.
  let partner: PartnerCtx | null = null;
  let admin: ReturnType<typeof createClient> | null = null;
  if (endpoint === "partner") {
    const key = extractApiKey(req.headers);
    const needsAuth = reqMsg.method === "tools/list" || reqMsg.method === "tools/call";
    if (key) {
      admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
      });
      const hash = await sha256Hex(key);
      const { data: v } = await admin.rpc("api_key_verify", {
        p_key_prefix: keyPrefix(key),
        p_key_hash: hash,
      });
      if (v && (v as { ok?: boolean }).ok === true) {
        const vv = v as { api_key_id: string; company_id: string; scopes: string[] };
        partner = { api_key_id: vv.api_key_id, company_id: vv.company_id, scopes: vv.scopes ?? [] };
      }
    }
    if (needsAuth && !partner) {
      return json(rpcError(id, JSONRPC.INVALID_REQUEST, "Chave de API inválida ou ausente (Authorization: Bearer mp_…)."), 401);
    }
  }

  // Notificações (sem id) não recebem resposta.
  if (isNotification(reqMsg) && reqMsg.method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: CORS });
  }

  let resp: Response;
  try {
    switch (reqMsg.method) {
      case "initialize": {
        const cp = (reqMsg.params as { protocolVersion?: string } | undefined)?.protocolVersion;
        const name = endpoint === "partner" ? "movepark-partner" : "movepark";
        resp = json(rpcResult(id, initializeResult(name, cp)));
        break;
      }
      case "ping":
        resp = json(rpcResult(id, {}));
        break;
      case "tools/list":
        resp = json(rpcResult(id, { tools: listTools(endpoint, partner?.scopes ?? []) }));
        break;
      case "tools/call": {
        const p = (reqMsg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const toolName = p.name ?? "";
        const args = p.arguments ?? {};
        // Gate de escopo (isToolCallable): out-of-scope no parceiro = inexistente (não revela).
        if (!isToolCallable(endpoint, toolName, partner?.scopes ?? [])) {
          resp = json(rpcError(id, JSONRPC.INVALID_PARAMS, `Tool indisponível: ${toolName}`));
          break;
        }
        const miss = missingRequired(findTool(endpoint, toolName)!, args);
        if (miss) {
          resp = json(rpcError(id, JSONRPC.INVALID_PARAMS, `Parâmetro obrigatório ausente: ${miss}`));
          break;
        }
        const data =
          endpoint === "public"
            ? await callPublic(toolName, args)
            : await callPartner(admin!, partner!, toolName, args);
        resp = json(rpcResult(id, toolTextContent(data)));
        break;
      }
      default:
        resp = json(rpcError(id, JSONRPC.METHOD_NOT_FOUND, `Método não suportado: ${reqMsg.method}`));
    }
  } catch (e) {
    // erro de execução de tool → result.isError (convenção MCP), não erro de protocolo
    resp =
      reqMsg.method === "tools/call"
        ? json(rpcResult(id, toolTextContent({ error: (e as Error).message }, true)))
        : json(rpcError(id, JSONRPC.INTERNAL_ERROR, (e as Error).message));
  }

  // Auditoria (Fase 1.1) — só parceiro autenticado; não bloqueia a resposta.
  if (endpoint === "partner" && partner && admin) {
    const toolName =
      reqMsg.method === "tools/call"
        ? ((reqMsg.params as { name?: string } | undefined)?.name ?? null)
        : null;
    const tool = toolName ? findTool("partner", toolName) : null;
    background(
      logRequest(admin, {
        api_key_id: partner.api_key_id,
        company_id: partner.company_id,
        surface: "mcp",
        method: reqMsg.method,
        path: toolName ?? reqMsg.method,
        scope: tool?.scope ?? null,
        status: resp.status,
        request_id: req.headers.get("x-request-id") ?? "",
        ip: clientIp(req),
        latency_ms: Date.now() - started,
      }),
    );
  }
  return resp;
});

// ── Auditoria (Fase 1.1) ─────────────────────────────────────────────────────
interface ApiLogRow {
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

function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

// deno-lint-ignore no-explicit-any
async function logRequest(admin: any, row: ApiLogRow): Promise<void> {
  try {
    await admin.from("api_request_log").insert(row);
  } catch {
    // auditoria nunca derruba a request
  }
}

function background(p: Promise<unknown>): void {
  const safe = p.catch(() => {});
  try {
    // @ts-expect-error - EdgeRuntime é global no Supabase Edge
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-expect-error - idem
      EdgeRuntime.waitUntil(safe);
    }
  } catch {
    // fallback: fire-and-forget
  }
}

// ── Handlers consumidor (anon) ───────────────────────────────────────────────
function anonClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
}

async function callPublic(name: string, a: Record<string, unknown>): Promise<unknown> {
  const sb = anonClient();
  const unwrap = <T>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  switch (name) {
    case "search_parking":
      return unwrap(
        await sb.functions.invoke("search", {
          body: {
            dest: a.dest,
            from: a.from,
            to: a.to,
            vehicle: a.vehicle,
            category: a.category,
            max_distance_km: a.max_distance_km,
            limit: a.limit ?? 20,
          },
        }),
      );
    case "simulate_price":
      return unwrap(
        await sb.rpc("simulate_price", {
          p_company: a.company,
          p_location: a.location ?? null,
          p_parking_type: a.parking_type ?? null,
          p_days: Number(a.days ?? 1),
        }),
      );
    case "get_faq":
      return unwrap(
        await sb.functions.invoke("get-faq", {
          body: { location_id: a.location_id ?? null, query: a.query ?? null, limit: a.limit ?? 20 },
        }),
      );
    case "list_companies":
      return unwrap(
        await sb.from("company").select("id, name, slug").order("name").limit(Number(a.limit ?? 50)),
      );
    case "list_locations":
      return unwrap(
        await sb
          .from("location")
          .select("id, name, slug, address, latitude, longitude")
          .is("deleted_at", null)
          .order("name")
          .limit(Number(a.limit ?? 50)),
      );
    case "get_parking_types":
      return unwrap(
        await sb
          .from("location_parking_type")
          .select("id, capacity, is_active, company_parking_type:company_parking_type_id(parking_type:parking_type_id(code, name))")
          .eq("location_id", a.location_id as string),
      );
    case "list_destinations":
      return unwrap(
        await sb
          .from("destination")
          .select("id, code, name, short_name, slug, type, city, state, country, latitude, longitude")
          .eq("is_published", true)
          .order("sort_order")
          .limit(Number(a.limit ?? 50)),
      );
    case "get_destination": {
      const dest = unwrap(
        await sb
          .from("destination")
          .select("id, code, name, short_name, slug, type, city, state, country, latitude, longitude, intro")
          .eq("slug", a.slug as string)
          .eq("is_published", true)
          .maybeSingle(),
      ) as { id?: string } | null;
      if (!dest?.id) throw new Error("Destino não encontrado.");
      const points = unwrap(
        await sb.from("destination_point").select("id, name, type, latitude, longitude").eq("destination_id", dest.id),
      );
      return { ...dest, points };
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

// ── Handlers parceiro (service_role + RPCs api_*, tenant-scoped) ──────────────
// deno-lint-ignore no-explicit-any
async function callPartner(admin: any, ctx: PartnerCtx, name: string, a: Record<string, unknown>): Promise<unknown> {
  const c = ctx.company_id;
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw error;
    return data;
  };
  switch (name) {
    case "list_locations":
      return call("api_list_locations", { p_company_id: c, p_limit: a.limit ?? 20, p_offset: a.offset ?? 0 });
    case "get_location":
      return call("api_get_location", { p_company_id: c, p_location_id: a.location_id });
    case "list_parking_types":
      return call("api_list_parking_types", { p_company_id: c, p_location_id: a.location_id });
    case "get_availability":
      await call("api_assert_lpt_company", { p_company_id: c, p_lpt_id: a.location_parking_type_id });
      return call("availability_batch", {
        p_lpt_ids: [a.location_parking_type_id],
        p_check_in_at: a.from,
        p_check_out_at: a.to,
      }).then((rows: unknown) => (Array.isArray(rows) ? rows[0] ?? null : rows));
    case "simulate_price":
      return call("api_simulate_price", {
        p_company_id: c,
        p_location_parking_type_id: a.location_parking_type_id,
        p_days: Number(a.days ?? 1),
      });
    case "list_bookings":
      return call("api_list_bookings", {
        p_company_id: c,
        p_status: a.status ?? null,
        p_from: a.from ?? null,
        p_to: a.to ?? null,
        p_limit: a.limit ?? 20,
        p_offset: a.offset ?? 0,
      });
    case "get_booking":
      return call("api_get_booking", { p_company_id: c, p_booking_id: a.booking_id });
    case "create_booking":
      return call("api_create_booking", {
        p_company_id: c,
        p_api_key_id: ctx.api_key_id,
        p_location_parking_type_id: a.location_parking_type_id,
        p_check_in_at: a.check_in_at,
        p_check_out_at: a.check_out_at,
        p_customer_name: a.customer_name ?? null,
        p_customer_email: a.customer_email ?? null,
        p_customer_phone: a.customer_phone ?? null,
        p_passenger_count: a.passenger_count ?? null,
        p_has_pcd: a.has_pcd ?? false,
        p_add_on_ids: a.add_on_service_ids ?? null,
        p_coupon_code: a.coupon_code ?? null,
        p_idempotency_key: a.idempotency_key ?? null,
        p_origin: "mcp",
      });
    case "cancel_booking":
      return call("api_cancel_booking", { p_company_id: c, p_booking_id: a.booking_id, p_reason: a.reason ?? null });
    case "check_in_booking":
      return call("api_checkin_booking", { p_company_id: c, p_booking_id: a.booking_id });
    case "check_out_booking":
      return call("api_checkout_booking", { p_company_id: c, p_booking_id: a.booking_id });
    case "change_booking_dates":
      return call("api_change_booking_dates", {
        p_company_id: c,
        p_booking_id: a.booking_id,
        p_check_in: a.check_in_at,
        p_check_out: a.check_out_at,
      });
    case "wps_event":
      return call("api_wps_event", {
        p_company_id: c,
        p_external_event_id: a.event_id,
        p_type: a.type,
        p_location_ref: a.location_ref ?? null,
        p_plate: a.plate ?? null,
        p_booking_code: a.booking_code ?? null,
        p_occurred_at: a.occurred_at ?? new Date().toISOString(),
      });
    // Promoções — cupons
    case "list_coupons":
      return call("api_list_coupons", { p_company_id: c });
    case "upsert_coupon":
      return call("api_upsert_coupon", {
        p_company_id: c, p_id: a.id ?? null, p_code: a.code, p_description: a.description ?? null,
        p_discount_type: a.discount_type ?? "percent", p_discount_value: a.discount_value ?? 0,
        p_valid_from: a.valid_from ?? null, p_valid_until: a.valid_until ?? null, p_max_uses: a.max_uses ?? null,
        p_is_active: a.is_active ?? true, p_sort_order: a.sort_order ?? 0, p_per_user_limit: a.per_user_limit ?? null,
        p_min_amount: a.min_amount ?? null, p_min_days: a.min_days ?? null, p_parking_type_ids: a.parking_type_ids ?? null,
      });
    case "set_coupon_active":
      return call("api_set_coupon_active", { p_company_id: c, p_coupon_id: a.id, p_is_active: a.is_active });
    case "delete_coupon":
      return call("api_delete_coupon", { p_company_id: c, p_coupon_id: a.id });
    // Promoções — descontos
    case "list_discounts":
      return call("api_list_discounts", { p_company_id: c });
    case "upsert_discount":
      return call("api_upsert_discount", {
        p_company_id: c, p_id: a.id ?? null, p_location_id: a.location_id ?? null, p_name: a.name,
        p_description: a.description ?? null, p_discount_type: a.discount_type ?? "percent",
        p_discount_value: a.discount_value ?? 0, p_valid_from: a.valid_from ?? null, p_valid_until: a.valid_until ?? null,
        p_min_days: a.min_days ?? null, p_min_amount: a.min_amount ?? null, p_advance_days: a.advance_days ?? null,
        p_allow_coupon_stack: a.allow_coupon_stack ?? true, p_priority: a.priority ?? 0,
        p_is_active: a.is_active ?? true, p_sort_order: a.sort_order ?? 0, p_parking_type_ids: a.parking_type_ids ?? null,
      });
    case "set_discount_active":
      return call("api_set_discount_active", { p_company_id: c, p_discount_rule_id: a.id, p_is_active: a.is_active });
    case "delete_discount":
      return call("api_delete_discount", { p_company_id: c, p_discount_rule_id: a.id });
    // Serviços adicionais
    case "list_addons":
      return call("api_list_addons", { p_company_id: c });
    case "upsert_addon":
      return call("api_upsert_addon", {
        p_company_id: c, p_id: a.id ?? null, p_code: a.code ?? null, p_name: a.name,
        p_description: a.description ?? null, p_base_price: a.base_price ?? 0,
        p_is_active: a.is_active ?? true, p_sort_order: a.sort_order ?? 0,
      });
    case "set_location_addon":
      return call("api_set_location_addon", {
        p_company_id: c, p_add_on_service_id: a.id, p_location_id: a.location_id,
        p_is_active: a.is_active ?? false, p_price_override: a.price_override ?? null,
      });
    case "delete_addon":
      return call("api_delete_addon", { p_company_id: c, p_add_on_service_id: a.id });
    // Avaliações
    case "list_reviews":
      return call("api_list_reviews", { p_company_id: c, p_limit: Number(a.limit ?? 50) });
    case "respond_review":
      return call("api_respond_review", { p_company_id: c, p_review_id: a.id, p_response: a.response ?? null });
    // Ocupação
    case "get_occupancy":
      return call("api_location_occupancy", { p_company_id: c, p_location_id: a.location_id, p_from: a.from, p_to: a.to });
    // Escritas
    case "update_location":
      return call("api_update_location", {
        p_company_id: c, p_location_id: a.location_id, p_name: a.name ?? null, p_address: a.address ?? null,
        p_phone: a.phone ?? null, p_email: a.email ?? null, p_reservation_policy: a.reservation_policy ?? null,
        p_has_notice: a.has_notice ?? null, p_notice: a.notice ?? null,
      });
    case "update_parking_type":
      return call("api_update_parking_type", {
        p_company_id: c, p_location_parking_type_id: a.location_parking_type_id, p_is_active: a.is_active ?? null,
        p_capacity: a.capacity ?? null, p_near_capacity_threshold: a.near_capacity_threshold ?? null,
        p_near_capacity_message: a.near_capacity_message ?? null, p_has_minimum_stay: a.has_minimum_stay ?? null,
        p_minimum_stay_value: a.minimum_stay_value ?? null, p_minimum_stay_unit: a.minimum_stay_unit ?? null,
        p_has_minimum_date: a.has_minimum_date ?? null, p_minimum_date: a.minimum_date ?? null,
      });
    // Precificação (E1.4.1) e bloqueio de datas (E1.4.2)
    case "update_pricing_rule":
      return call("api_set_pricing", {
        p_company_id: c, p_location_parking_type_id: a.location_parking_type_id,
        p_base_price: a.base_price ?? null, p_rule: a.rule ?? {}, p_tiers: a.tiers ?? [],
      });
    case "set_date_blocked":
      return call("api_set_date_blocked", {
        p_company_id: c, p_location_parking_type_id: a.location_parking_type_id,
        p_date: a.date, p_blocked: a.blocked,
      });
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
