// Edge Function: /mcp  — Servidor MCP (Model Context Protocol) do Movepark (E0.7 Fase 2).
// Streamable HTTP / JSON-RPC 2.0, stateless. Três superfícies pelo path:
//   /mcp  ou /mcp/public   → CONSUMIDOR anon: descoberta (buscar, simular preço, FAQ, catálogo).
//   /mcp/partner           → PARCEIRO (Authorization: Bearer mp_…): tools tenant-scoped
//                            sobre a API v1 (escopos da chave), reusa RPCs api_* + api_key_verify.
//   /mcp/customer          → CONSUMIDOR autenticado: descoberta + login por OTP (request/verify)
//                            em nome do usuário final. Auth opcional (as tools de login são pré-login;
//                            whoami lê o JWT). Transacionais entram em F2. Ver agent-booking.md.
// Servido externamente em https://mcp.movepark.co (proxy Cloudflare Worker — src/api-worker.ts).
// Ver docs/specs/mcp.md. server-card: /.well-known/mcp/server-card.json (+ partner/customer).

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
  safeToolError,
  toolTextContent,
} from "./protocol.ts";
import { findTool, isToolCallable, listTools, missingRequired, type Endpoint } from "./tools.ts";
import { extractApiKey, keyPrefix, sha256Hex } from "./auth.ts";
import { generateAndStoreVoucher } from "../_shared/voucher/pdf.ts";
import { callRead, READ_TOOL_NAMES } from "../_shared/assistant-tools.ts";
import { CUSTOMER_TXN_NAMES, otpRequestParams, otpVerifyParams } from "./customer.logic.ts";

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
  const endpoint: Endpoint = url.pathname.includes("/partner")
    ? "partner"
    : url.pathname.includes("/customer")
      ? "customer"
      : "public";

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
        const name =
          endpoint === "partner"
            ? "movepark-partner"
            : endpoint === "customer"
              ? "movepark-customer"
              : "movepark";
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
          endpoint === "partner"
            ? await callPartner(admin!, partner!, toolName, args)
            : endpoint === "customer"
              ? await callCustomer(req.headers.get("Authorization"), toolName, args)
              : await callPublic(toolName, args);
        resp = json(rpcResult(id, toolTextContent(data)));
        break;
      }
      default:
        resp = json(rpcError(id, JSONRPC.METHOD_NOT_FOUND, `Método não suportado: ${reqMsg.method}`));
    }
  } catch (e) {
    // erro de execução de tool → result.isError (convenção MCP), não erro de protocolo.
    // safeToolError evita vazar a mensagem crua do Postgres (nome de constraint/coluna/schema).
    const msg = safeToolError(e);
    resp =
      reqMsg.method === "tools/call"
        ? json(rpcResult(id, toolTextContent({ error: msg }, true)))
        : json(rpcError(id, JSONRPC.INTERNAL_ERROR, msg));
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

// Cliente com o JWT do usuário no header: a RLS filtra sozinha (leituras/whoami do dono).
function userClient(authHeader: string) {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

// Handler único, compartilhado com a Edge `chat` (ver _shared/assistant-tools.ts).
function callPublic(name: string, a: Record<string, unknown>): Promise<unknown> {
  return callRead(anonClient(), name, a);
}

// ── Handlers consumidor autenticado (/customer) ──────────────────────────────
// Descoberta reusa callRead; login passwordless em nome do usuário via GoTrue (OTP).
async function callCustomer(
  authHeader: string | null,
  name: string,
  a: Record<string, unknown>,
): Promise<unknown> {
  if (READ_TOOL_NAMES.has(name)) return callRead(anonClient(), name, a);

  // Login (pré-sessão): não exige JWT.
  switch (name) {
    case "request_login_otp": {
      const sb = anonClient();
      // otpRequestParams valida o canal e monta o payload (phone+channel / email).
      const { error } = await sb.auth.signInWithOtp(otpRequestParams(a.channel, a.identifier));
      if (error) throw new Error(error.message);
      return { status: "sent", channel: a.channel };
    }
    case "verify_login_otp": {
      const sb = anonClient();
      const { data, error } = await sb.auth.verifyOtp(otpVerifyParams(a.channel, a.identifier, a.code));
      if (error) throw new Error(error.message);
      const s = data.session;
      if (!s) throw new Error("Código verificado, mas nenhuma sessão foi criada.");
      return {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
        token_type: s.token_type,
        user: { id: data.user?.id ?? null },
      };
    }
    case "whoami": {
      if (!authHeader?.startsWith("Bearer ")) return { authenticated: false };
      const { data, error } = await userClient(authHeader).auth.getUser();
      if (error || !data.user) return { authenticated: false };
      return {
        authenticated: true,
        user_id: data.user.id,
        email: data.user.email ?? null,
        phone: data.user.phone ?? null,
      };
    }
  }

  // Transacionais: exigem sessão. Recusa cedo com mensagem amigável se faltar o JWT.
  if (CUSTOMER_TXN_NAMES.has(name)) {
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Faça login primeiro (request_login_otp e verify_login_otp).");
    }
    return callCustomerTxn(authHeader, name, a);
  }

  throw new Error(`Tool desconhecida: ${name}`);
}

// Transacionais do consumidor: reservar em nome do usuário logado. Escrita/leitura direta sob a
// RLS do dono (o mesmo caminho do checkout web); create/cancel repassam o JWT às Edges.
async function callCustomerTxn(
  authHeader: string,
  name: string,
  a: Record<string, unknown>,
): Promise<unknown> {
  const sb = userClient(authHeader);
  const unwrap = <T>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  // Repassa o JWT do usuário a uma Edge de consumidor (mesmo padrão do chat).
  const invokeEdge = async (fn: string, body: Record<string, unknown>) => {
    const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env("SUPABASE_ANON_KEY"), Authorization: authHeader },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `Falha (${res.status})`);
    return data;
  };

  switch (name) {
    case "create_booking":
      return invokeEdge("create-booking", {
        location_parking_type_id: a.location_parking_type_id,
        check_in_at: a.check_in_at,
        check_out_at: a.check_out_at,
        fare_tier: a.fare_tier ?? null,
        add_on_service_ids: a.add_on_service_ids ?? null,
        coupon_code: a.coupon_code ?? null,
        passenger_count: a.passenger_count ?? null,
        has_pcd: a.has_pcd ?? false,
        origin: "mcp",
      });

    case "cancel_booking":
      return invokeEdge("cancel-booking", { booking_code: a.booking_code, reason: a.reason ?? null });

    case "set_booking_customer": {
      // Só os campos informados (undefined não sobrescreve). tax_id/phone são exigidos no pagamento.
      const patch: Record<string, unknown> = {};
      if (a.tax_id !== undefined) patch.customer_tax_id = a.tax_id;
      if (a.phone !== undefined) patch.customer_phone = a.phone;
      if (a.email !== undefined) patch.customer_email = a.email;
      if (a.first_name !== undefined) patch.customer_first_name = a.first_name;
      if (a.last_name !== undefined) patch.customer_last_name = a.last_name;
      if (Object.keys(patch).length === 0) return { updated: false };
      const rows = unwrap(
        await sb.from("booking").update(patch).eq("code", a.booking_code as string).select("code").maybeSingle(),
      ) as { code?: string } | null;
      if (!rows?.code) throw new Error("Reserva não encontrada.");
      return { updated: true, booking_code: rows.code };
    }

    case "add_vehicle": {
      const { data: u } = await sb.auth.getUser();
      if (!u?.user) throw new Error("Sessão inválida.");
      // is_default único por perfil: zera os outros antes, se for marcar como padrão.
      if (a.set_default) {
        await sb.from("vehicle").update({ is_default: false }).eq("profile_id", u.user.id);
      }
      const veh = unwrap(
        await sb
          .from("vehicle")
          .insert({
            profile_id: u.user.id,
            license_plate: a.license_plate,
            model: a.model ?? null,
            color: a.color ?? null,
            is_default: a.set_default ?? false,
          })
          .select("id, license_plate, model, color, is_default")
          .single(),
      );
      return veh;
    }

    case "set_booking_vehicle": {
      const rows = unwrap(
        await sb
          .from("booking")
          .update({ vehicle_id: a.vehicle_id })
          .eq("code", a.booking_code as string)
          .select("code, vehicle_id")
          .maybeSingle(),
      ) as { code?: string } | null;
      if (!rows?.code) throw new Error("Reserva não encontrada.");
      return { updated: true, booking_code: rows.code };
    }

    case "list_my_bookings":
      return unwrap(
        await sb
          .from("booking")
          .select("code, status, check_in_at, check_out_at, total_amount, currency")
          .is("deleted_at", null)
          .order("check_in_at", { ascending: false })
          .limit(Number(a.limit ?? 10)),
      );

    case "get_booking":
      return unwrap(
        await sb
          .from("booking")
          .select(
            "code, status, check_in_at, check_out_at, total_amount, currency, expires_at, customer_tax_id, customer_phone, customer_email, vehicle_id, location:location_id(name, slug)",
          )
          .eq("code", a.booking_code as string)
          .maybeSingle(),
      );

    case "get_booking_status": {
      const b = unwrap(
        await sb
          .from("booking")
          .select("code, status, expires_at, payment:payment(status, method, created_at)")
          .eq("code", a.booking_code as string)
          .maybeSingle(),
      ) as
        | { code?: string; status?: string; expires_at?: string; payment?: Array<{ status?: string; method?: string }> }
        | null;
      if (!b?.code) throw new Error("Reserva não encontrada.");
      // Pega o pagamento mais recente (a reserva pode ter tentativas).
      const pay = Array.isArray(b.payment) ? b.payment[b.payment.length - 1] ?? null : b.payment ?? null;
      return {
        booking_code: b.code,
        status: b.status,
        expires_at: b.expires_at,
        payment_status: (pay as { status?: string } | null)?.status ?? null,
        payment_method: (pay as { method?: string } | null)?.method ?? null,
      };
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
    case "change_booking_vehicle": {
      const res = await call("api_change_booking_vehicle", {
        p_company_id: c,
        p_booking_id: a.booking_id,
        p_vehicle_id: a.vehicle_id ?? null,
        p_license_plate: a.license_plate ?? null,
      });
      // O voucher mostra a placa: regenera em background se a reserva já está confirmada.
      if ((res as { status?: string })?.status === "confirmed") {
        background(
          generateAndStoreVoucher(admin, (res as { booking_id: string }).booking_id, env("PUBLIC_SITE_URL") ?? "https://hub.movepark.co"),
        );
      }
      return res;
    }
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
