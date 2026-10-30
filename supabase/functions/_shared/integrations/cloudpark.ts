// Adaptador da Cloudpark (sistema de cancela de Nationpark e Abbapark).
// Spec: docs/specs/integracoes.md § 2.1 (o que o n8n fazia) e § 3 (a API).
// API: Swagger oficial v5.22.2, https://sandbox.cloudpark.com.br/static/swagger.yaml
//
//   POST {base}/api/v1/integration/reserveparking   cria a reserva; devolve { message: <código> }
//   GET  {base}/api/v1/integration/customerplan     lista os planos; serve para testar a conexão
//   Cabeçalho: Authorization: Token <token>
//
// O corpo repete o que o n8n mandava (docs/specs/integracoes.md § 2.1), incluindo `whitelabel`,
// `category` e `product`, que a documentação não cita: até sabermos se a instância usa (G3), vão
// do mesmo jeito. A API não tem rota de cancelar nem de alterar.

import type { AccessProvider, CallOptions, FailureKind, ReserveInput, ReserveOutcome, TestOutcome } from "./types.ts";

export interface CloudparkConfig {
  base_url: string;
  plan_id: number | null;
  entry_margin_min: number;
  exit_margin_min: number;
  whitelabel: string | null;
  category: string | null;
  product_names: Record<string, string>;
}

/** Só o link de nuvem: o Hub não alcança a rede local do pátio. Mesmo padrão do CHECK do banco. */
const CLOUD_URL = /^https:\/\/[a-z0-9-]+\.cloudpark\.com\.br$/;
const DEFAULT_MARGIN_MIN = 60;
const DEFAULT_TIMEOUT_MS = 20_000;

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function minutes(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(240, Math.max(0, Math.round(n)));
}

export function parseCloudparkConfig(raw: unknown): CloudparkConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = (text(r.base_url) ?? "").toLowerCase().replace(/\/+$/, "");
  if (!CLOUD_URL.test(base)) {
    throw new Error("Endereço da Cloudpark inválido. Use o link de nuvem, como https://1234.cloudpark.com.br");
  }
  const plan = typeof r.plan_id === "number" ? r.plan_id : Number(r.plan_id);
  const names: Record<string, string> = {};
  if (r.product_names && typeof r.product_names === "object") {
    for (const [k, v] of Object.entries(r.product_names as Record<string, unknown>)) {
      const t = text(v);
      if (t) names[k] = t;
    }
  }
  return {
    base_url: base,
    plan_id: Number.isInteger(plan) && plan > 0 ? plan : null,
    entry_margin_min: minutes(r.entry_margin_min, DEFAULT_MARGIN_MIN),
    exit_margin_min: minutes(r.exit_margin_min, DEFAULT_MARGIN_MIN),
    whitelabel: text(r.whitelabel),
    category: text(r.category),
    product_names: names,
  };
}

/** "YYYY-MM-DD HH:mm:ss" no horário de São Paulo, deslocado em minutos (folga da janela). */
export function cloudparkLocalDateTime(iso: string, shiftMinutes: number): string {
  const d = new Date(new Date(iso).getTime() + shiftMinutes * 60_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizePlate(p: string | null): string | null {
  const n = (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return n || null;
}

export function buildCloudparkReservation(input: ReserveInput, cfg: CloudparkConfig): Record<string, unknown> {
  const plate = normalizePlate(input.plate);
  const product = (input.parkingTypeId && cfg.product_names[input.parkingTypeId]) || input.parkingTypeName;
  const body: Record<string, unknown> = {
    initial_date: cloudparkLocalDateTime(input.checkInAt, -cfg.entry_margin_min),
    final_date: cloudparkLocalDateTime(input.checkOutAt, cfg.exit_margin_min),
    original_initial_date: cloudparkLocalDateTime(input.checkInAt, 0),
    original_final_date: cloudparkLocalDateTime(input.checkOutAt, 0),
    license_plate: plate,
    email: input.email,
    name: input.firstName,
    last_name: input.lastName,
    document: input.taxId,
    phone: input.phone,
    total_price_value: input.totalAmount,
    passenger_count: input.passengerCount,
    has_pcd: input.hasPcd,
    vehicle: { license_plate: plate, brand: null, model: input.vehicleModel, color: input.vehicleColor },
    fipe_model: { name: input.vehicleModel, fipe_name: input.vehicleModel, custom_name: input.vehicleModel },
    origin: "movepark-hub",
    booking_code: input.bookingCode,
  };
  if (cfg.plan_id) body.plan_id = cfg.plan_id;
  if (cfg.whitelabel) body.whitelabel = cfg.whitelabel;
  if (cfg.category) body.category = cfg.category;
  if (product) body.product = product;
  return body;
}

function messageOf(body: unknown): string | null {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    return text(b.message) ?? text(b.detail);
  }
  return text(body);
}

type Interpreted = { ok: true; code: string } | { ok: false; kind: FailureKind; error: string };

export function interpretCloudparkResponse(status: number, body: unknown): Interpreted {
  if (status >= 200 && status < 300) {
    const code = body && typeof body === "object" ? text((body as Record<string, unknown>).message) : null;
    if (code) return { ok: true, code };
    return { ok: false, kind: "transient", error: "A Cloudpark respondeu sem código de acesso." };
  }
  const msg = messageOf(body) ?? `HTTP ${status}`;
  if (status === 401 || status === 403) return { ok: false, kind: "auth", error: msg };
  if (status === 408 || status === 429 || status >= 500) return { ok: false, kind: "transient", error: msg };
  return { ok: false, kind: "rejected", error: msg };
}

async function call(
  url: string,
  init: RequestInit,
  opts: CallOptions | undefined,
): Promise<{ status: number | null; body: unknown; durationMs: number; error?: string }> {
  const f = opts?.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await f(url, { ...init, signal: ctrl.signal });
    const raw = await res.text();
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      // resposta não-JSON (página de erro do servidor): fica o texto cru
    }
    return { status: res.status, body, durationMs: Date.now() - started };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      status: null,
      body: null,
      durationMs: Date.now() - started,
      error: aborted ? "A Cloudpark não respondeu a tempo." : `Falha de rede: ${e instanceof Error ? e.message : e}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Planos da instância. O Swagger promete uma lista, mas a produção (instância 1269, medido em
 * 30/10/2026) devolve uma página do Django REST, `{count, next, previous, results}`, com o id em
 * texto. Aceita os dois e descarta plano apagado. Devolve null quando a resposta não é de planos.
 */
export function parseCloudparkPlans(body: unknown): { id: number; name: string }[] | null {
  const lista = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).results)
    ? (body as Record<string, unknown>).results as unknown[]
    : null;
  if (!lista) return null;
  const planos: { id: number; name: string }[] = [];
  for (const raw of lista) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (p.deleted === true) continue;
    const id = typeof p.id === "number" ? p.id : Number(p.id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    planos.push({ id, name: text(p.name) ?? `Plano ${id}` });
  }
  return planos;
}

function headers(secret: string): Record<string, string> {
  return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Token ${secret}` };
}

export const cloudpark: AccessProvider<CloudparkConfig> = {
  key: "cloudpark",
  name: "Cloudpark",
  parseConfig: parseCloudparkConfig,

  async testConnection(cfg, secret, opts): Promise<TestOutcome> {
    const c = parseCloudparkConfig(cfg);
    const r = await call(`${c.base_url}/api/v1/integration/customerplan`, { method: "GET", headers: headers(secret) }, opts);
    if (r.status === null) return { ok: false, kind: "transient", detail: r.error ?? "Falha de rede" };
    const plans = r.status >= 200 && r.status < 300 ? parseCloudparkPlans(r.body) : null;
    if (plans) {
      const n = plans.length;
      return { ok: true, detail: `Conectado. ${n} ${n === 1 ? "plano encontrado" : "planos encontrados"}.`, plans };
    }
    const i = interpretCloudparkResponse(r.status, r.body);
    return i.ok
      ? { ok: false, kind: "rejected", detail: "Resposta inesperada da Cloudpark." }
      : { ok: false, kind: i.kind, detail: i.error };
  },

  async reserve(cfg, secret, input, opts): Promise<ReserveOutcome> {
    const c = parseCloudparkConfig(cfg);
    const request = buildCloudparkReservation(input, c);
    const r = await call(
      `${c.base_url}/api/v1/integration/reserveparking`,
      { method: "POST", headers: headers(secret), body: JSON.stringify(request) },
      opts,
    );
    if (r.status === null) {
      return { ok: false, kind: "transient", error: r.error ?? "Falha de rede", httpStatus: null, durationMs: r.durationMs, request, response: null };
    }
    const i = interpretCloudparkResponse(r.status, r.body);
    if (i.ok) return { ok: true, code: i.code, httpStatus: r.status, durationMs: r.durationMs, request, response: r.body };
    return { ok: false, kind: i.kind, error: i.error, httpStatus: r.status, durationMs: r.durationMs, request, response: r.body };
  },
};
