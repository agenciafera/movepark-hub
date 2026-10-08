// Cliente do backend white-label legado (integração de disponibilidade · E2.5.1).
//
// O path da API é fixo (/api/v3/backend); por empresa variam o domínio (host) e o
// tenant (header X-Tenant). O Bearer é GLOBAL e vem do env WL_BACKEND_TOKEN, e nunca
// trafega o front. Resolve-se a config por empresa via RPC wl_company_config / service-role.

import { siteUrl } from "../site.ts";

export const WL_API_PATH = "/api/v3/backend";

export interface WlConfig {
  wl_domain: string | null;
  wl_tenant_key: string | null;
  wl_sync_enabled: boolean;
}

export interface WlAvailabilityDay {
  date: string;
  capacity: number;
  sold_wl: number;
  sold_external: number;
  available: number;
}

export interface AvailabilityParams {
  category_slug: string;
  product_slug?: string | null;
  start_date: string;
  end_date?: string | null;
}

export interface SyncBody {
  external_id: string;
  operation: "reserve" | "release";
  category_slug: string;
  product_slug: string;
  quantity: number;
  start_date: string;
  end_date?: string | null;
}

export interface WlCategory {
  slug: string;
  name: string;
}

export interface WlProduct {
  slug: string;
  name: string;
  category_slug: string;
}

/** Normaliza o que estiver salvo no domínio para apenas o host. */
export function normalizeWlDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const host = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return host || null;
}

/** Hostname puro: rótulos separados por ponto e TLD de letras (sem porta, usuário@, IP nem espaço). */
const HOSTNAME = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * O host do backend do legado, se ele for permitido; senão null.
 *
 * O Bearer do legado é UM só para todos os tenants (08/10/2026): um `wl_domain` mal cadastrado
 * (IP, porta, usuário@host, outro domínio) mandaria o token para outro lugar. Só vale hostname
 * puro sob o domínio canônico do site, que é onde o legado mora. O domínio não é escrito aqui: vem
 * de `_shared/site.ts` (regra de host do projeto). O banco confere o formato
 * (`company_wl_domain_hostname`); o sufixo é conferido aqui, antes de qualquer chamada.
 */
export function wlAllowedHost(
  input: string | null | undefined,
  base: string = new URL(siteUrl()).hostname,
): string | null {
  const host = normalizeWlDomain(input);
  if (!host || !HOSTNAME.test(host)) return null;
  return host === base || host.endsWith(`.${base}`) ? host : null;
}

/** Igual a `wlAllowedHost`, mas falha alto: nenhuma chamada sai para host fora da lista. */
export function requireWlHost(input: string | null | undefined): string {
  const host = wlAllowedHost(input);
  if (!host) throw new Error(`wl_domain fora do permitido: ${String(input ?? "").slice(0, 80)}`);
  return host;
}

/** A empresa está pronta para sincronizar (toggle ligado + domínio permitido + tenant). */
export function wlReady(c: WlConfig | null | undefined): boolean {
  return !!c && !!c.wl_sync_enabled && !!wlAllowedHost(c.wl_domain) && !!c.wl_tenant_key;
}

/**
 * Confere a chave interna (`x-wl-deliver-key`) das Edges chamadas pelo pg_cron, em tempo constante.
 * Antes era `!==`, que responde mais rápido quanto mais cedo o primeiro caractere difere.
 */
export function hasInternalKey(req: Request, expected: string | null | undefined): boolean {
  const got = req.headers.get("x-wl-deliver-key") ?? "";
  if (!expected) return false;
  const a = new TextEncoder().encode(got);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/**
 * Teto de cada chamada ao WL. Sem ele, uma resposta que trava segura a Edge até o limite de
 * 150s e ela morre antes do `catch`: nada é registrado e, no espelho de preço, a mesma vaga
 * volta no topo da passada seguinte.
 */
export const WL_TIMEOUT_MS = 20_000;

/** Erro HTTP do WL com o status separado, para a fila gravar `last_status`. */
export class WlHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "WlHttpError";
  }
}

/** O status HTTP de um erro do WL, ou null quando a falha foi de rede ou de tempo. */
export function wlErrorStatus(e: unknown): number | null {
  return e instanceof WlHttpError ? e.status : null;
}

/**
 * `fetch` com teto de tempo e sem seguir redirecionamento. O Bearer é o mesmo para todos os
 * tenants: um domínio mal cadastrado que redirecione para outro host não pode levar o token
 * junto. Redirecionamento vira resposta não-ok e cai no erro de quem chamou.
 */
export function wlFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(WL_TIMEOUT_MS) });
}

export function buildAvailabilityUrl(domain: string, p: AvailabilityParams): string {
  const host = requireWlHost(domain);
  const u = new URL(`https://${host}${WL_API_PATH}/availability`);
  u.searchParams.set("category_slug", p.category_slug);
  if (p.product_slug) u.searchParams.set("product_slug", p.product_slug);
  u.searchParams.set("start_date", p.start_date);
  if (p.end_date) u.searchParams.set("end_date", p.end_date);
  return u.toString();
}

/**
 * Normaliza a resposta de disponibilidade do WL. Shape real (produção):
 *   { data: { units: [ { product_slug, days: [ { date, capacity, sold_wl, sold_external, available } ] } ] } }
 * Também aceita formas simples ([...], {data:[...]}, {days:[...]}) por robustez.
 * Quando `productSlug` é informado e a resposta vem por `units`, considera só a unidade
 * correspondente, para não misturar nem sobrescrever o `sold_wl` de outro produto por data.
 */
export function parseAvailabilityResponse(
  json: unknown,
  productSlug?: string | null,
): WlAvailabilityDay[] {
  const out: WlAvailabilityDay[] = [];
  const pushDays = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const row of arr) {
      const r = (row ?? {}) as Record<string, unknown>;
      if (r.date == null) continue;
      out.push({
        date: String(r.date),
        capacity: Number(r.capacity ?? 0),
        sold_wl: Number(r.sold_wl ?? 0),
        sold_external: Number(r.sold_external ?? 0),
        available: Number(r.available ?? 0),
      });
    }
  };

  const root =
    json && typeof json === "object" && !Array.isArray(json)
      ? ((json as Record<string, unknown>).data ?? json)
      : json;

  if (Array.isArray(root)) {
    pushDays(root);
  } else if (root && typeof root === "object") {
    const o = root as Record<string, unknown>;
    if (Array.isArray(o.units)) {
      for (const u of o.units) {
        const unit = (u ?? {}) as Record<string, unknown>;
        // Só pula a unidade quando ela declara um product_slug diferente do pedido.
        if (productSlug && unit.product_slug != null && unit.product_slug !== productSlug) continue;
        pushDays(unit.days);
      }
    } else {
      pushDays(o.days ?? o.availability);
    }
  }
  return out;
}

function wlHeaders(tenant: string, token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "X-Tenant": tenant,
    "Content-Type": "application/json",
  };
}

export async function wlGetAvailability(
  c: WlConfig,
  token: string,
  p: AvailabilityParams,
): Promise<WlAvailabilityDay[]> {
  const res = await wlFetch(buildAvailabilityUrl(c.wl_domain!, p), {
    headers: wlHeaders(c.wl_tenant_key!, token),
  });
  if (!res.ok) throw new WlHttpError(res.status, `WL availability ${res.status}`);
  return parseAvailabilityResponse(await res.json(), p.product_slug);
}

export async function wlPostSync(
  c: WlConfig,
  token: string,
  body: SyncBody,
): Promise<{ status?: string }> {
  const host = requireWlHost(c.wl_domain);
  const res = await wlFetch(`https://${host}${WL_API_PATH}/availability/sync`, {
    method: "POST",
    headers: wlHeaders(c.wl_tenant_key!, token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new WlHttpError(res.status, `WL sync ${res.status}: ${JSON.stringify(json)}`);
  return json as { status?: string };
}

// Catálogo usa a API PÚBLICA do WL (storefront), não a /backend: é multi-tenant por domínio
// e NÃO exige auth (Bearer). Endpoints (ver docs/Movepark v3.0.postman_collection.json):
//   GET /api/v3/categories?lang=pt-br                       → { data: [{ slug, name }] }
//   GET /api/v3/categories/<slug>?lang=pt-br&is_spot=1       → { data: { products: [{ slug, name }] } }
export const WL_PUBLIC_PATH = "/api/v3";

function publicHeaders(): HeadersInit {
  return { Accept: "application/json", "Content-Type": "application/json" };
}

export function parseCategories(json: unknown): WlCategory[] {
  let arr: unknown = json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    arr = (json as Record<string, unknown>).data ?? [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return { slug: String(r.slug ?? ""), name: String(r.name ?? r.slug ?? "") };
    })
    .filter((c) => c.slug);
}

/** Produtos vêm aninhados em `data.products` do "get category". */
export function parseCategoryProducts(json: unknown, categorySlug: string): WlProduct[] {
  let data: unknown = json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    data = (json as Record<string, unknown>).data ?? json;
  }
  const products =
    data && typeof data === "object" ? (data as Record<string, unknown>).products : null;
  if (!Array.isArray(products)) return [];
  return products
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        slug: String(r.slug ?? ""),
        name: String(r.name ?? r.slug ?? ""),
        category_slug: categorySlug,
      };
    })
    .filter((p) => p.slug);
}

export async function wlGetCategories(c: WlConfig): Promise<WlCategory[]> {
  const host = requireWlHost(c.wl_domain);
  const res = await wlFetch(`https://${host}${WL_PUBLIC_PATH}/categories?lang=pt-br`, {
    headers: publicHeaders(),
  });
  if (!res.ok) throw new Error(`WL categories ${res.status}`);
  return parseCategories(await res.json());
}

export async function wlGetCategoryProducts(c: WlConfig, categorySlug: string): Promise<WlProduct[]> {
  const host = requireWlHost(c.wl_domain);
  const res = await wlFetch(
    `https://${host}${WL_PUBLIC_PATH}/categories/${encodeURIComponent(categorySlug)}?lang=pt-br&is_spot=1`,
    { headers: publicHeaders() },
  );
  if (!res.ok) throw new Error(`WL category ${categorySlug} ${res.status}`);
  return parseCategoryProducts(await res.json(), categorySlug);
}

/** Catálogo completo: lista categorias e, pra cada uma, seus produtos (spots). */
export async function wlGetCatalog(
  c: WlConfig,
): Promise<{ categories: WlCategory[]; products: WlProduct[] }> {
  const categories = await wlGetCategories(c);
  const nested = await Promise.all(
    categories.map((cat) => wlGetCategoryProducts(c, cat.slug).catch(() => [] as WlProduct[])),
  );
  return { categories, products: nested.flat() };
}

// ─────────────────────── Cotação de preço do carrinho (E0.13) ───────────────────────
//
// Endpoint que o amostrador de preço usa para reconstruir a tabela de uma unidade externa.
// Fica na API pública do storefront (`/api/v3`), não na `/backend`, então NÃO leva Bearer.
//
// Duas armadilhas confirmadas na mão em 08/08/2026, e as duas custam meia hora se não
// estiverem escritas:
//   1. `X-Tenant` foi anotado como OBRIGATÓRIO aqui, com 500 e página de exceção em HTML sem
//      ele. **Remedido em 24/08/2026** contra virapark, plenty e nationpark: os três devolvem
//      200 e o MESMO preço com e sem o header, porque o domínio por empresa já identifica o
//      tenant. Continuamos mandando, que é de graça, mas não trate a ausência dele como
//      explicação para um 500: em agosto isso custou meia hora de investigação na direção
//      errada, e agora custaria de novo.
//   2. A data é `Y-m-d H:i:s`, com os dois-pontos percent-encoded. Qualquer outro formato
//      (ISO com "T", ou só a data) devolve 400 nomeando o campo.

export interface WlPriceQuote {
  price: number;
  oldPrice: number | null;
  /** Como o WL decompôs a duração (ex.: `1_1_i0_h21_d8_m0_y0`). Útil no log da amostragem. */
  offerCode: string | null;
}

/**
 * O parceiro recusou a cotação porque a estadia é menor que o mínimo dele.
 *
 * Vale como DADO, não como falha: é o parceiro dizendo qual é o piso da tabela. O amostrador
 * usa esse número para começar a curva no lugar certo, em vez de abortar a vaga inteira.
 */
export class WlMinimumStayError extends Error {
  readonly minimumDays: number;
  constructor(minimumDays: number, detail: string) {
    super(`WL exige estadia mínima de ${minimumDays} dia(s): ${detail}`);
    this.name = "WlMinimumStayError";
    this.minimumDays = minimumDays;
  }
}

/**
 * Extrai o mínimo do 400 do parceiro.
 *
 * Formato real (conferido em 10/08/2026 nos cinco tenants):
 *   { "errors": { "fields": [ { "field": "reservas",
 *                              "message": "Período mínimo de permanência: 3 dia(s)" } ] } }
 *
 * O número vem SÓ na mensagem, e a mensagem é em português. Não dá para ler isso do catálogo:
 * o `minimum_stay` de `/api/v3/categories` mente (o Abbapark declara 0 e recusa 1 e 2 dias; o
 * Nationpark declara 2 HORAS e recusa 2 dias). A recusa da cotação é a única fonte confiável.
 *
 * Parseia o JSON ANTES de casar a expressão. O corpo que vem do October escapa os acentos
 * (`Período mínimo`), então uma regex direta no texto cru não acha "mínimo" e o piso
 * some. Foi assim que a primeira versão passou no teste e falhou nas dez vagas em produção: o
 * `JSON.stringify` do teste preserva o acento, o servidor não. O texto cru fica de reserva para
 * o caso de a resposta não ser JSON.
 */
export function parseMinimumStayDays(body: string): number | null {
  const candidates: string[] = [body];
  try {
    const parsed = JSON.parse(body) as {
      errors?: { message?: string; fields?: { message?: string }[] };
    };
    for (const f of parsed?.errors?.fields ?? []) {
      if (f?.message) candidates.unshift(f.message);
    }
    if (parsed?.errors?.message) candidates.push(parsed.errors.message);
  } catch {
    // Não é JSON (página de exceção em HTML, por exemplo): sobra o texto cru.
  }

  for (const text of candidates) {
    const match = /m[ií]nimo\s+de\s+perman[eê]ncia:\s*(\d+)\s*dia/i.exec(text);
    if (!match) continue;
    const days = Number(match[1]);
    if (Number.isInteger(days) && days > 0) return days;
  }
  return null;
}

/** `Y-m-d H:i:s` no fuso da unidade. O WL valida o formato e recusa qualquer outro. */
export function formatWlDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

export function buildCalculationPriceUrl(
  domain: string,
  p: { categorySlug: string; productSlug: string; initial: Date; final: Date },
): string {
  const host = requireWlHost(domain);
  const qs = new URLSearchParams({
    initial_date: formatWlDateTime(p.initial),
    final_date: formatWlDateTime(p.final),
    category_slug: p.categorySlug,
    product_slug: p.productSlug,
  });
  return `https://${host}${WL_PUBLIC_PATH}/cart/calculation-price?${qs.toString()}`;
}

/** Extrai preço, balcão e código da oferta da resposta do carrinho. */
export function parseCalculationPrice(json: unknown): WlPriceQuote {
  // deno-lint-ignore no-explicit-any
  const j = json as any;
  // `total_price` mora DENTRO de `data.cart`, ao lado de `positions` e `discounts`. O fallback
  // em `data.total_price` fica porque é onde a leitura ingênua procura primeiro.
  const total = j?.data?.cart?.total_price ?? j?.data?.total_price;
  if (total?.price == null) {
    throw new Error(`resposta sem total_price.price: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return {
    price: Number(total.price),
    oldPrice: total.old_price == null ? null : Number(total.old_price),
    offerCode: j?.data?.cart?.positions?.items?.[0]?.offer?.code ?? null,
  };
}

export async function wlGetCalculationPrice(
  c: WlConfig,
  p: { categorySlug: string; productSlug: string; initial: Date; final: Date },
): Promise<WlPriceQuote> {
  const res = await wlFetch(buildCalculationPriceUrl(c.wl_domain!, p), {
    headers: { Accept: "application/json", "X-Tenant": c.wl_tenant_key! },
  });
  const body = await res.text();
  if (!res.ok) {
    const minimumDays = parseMinimumStayDays(body);
    if (minimumDays != null) throw new WlMinimumStayError(minimumDays, `${p.productSlug} ${res.status}`);
    throw new WlHttpError(res.status, `WL calculation-price ${res.status}: ${body.slice(0, 300)}`);
  }
  return parseCalculationPrice(JSON.parse(body));
}

// ── Lista incremental de pedidos (reservas do site no Hub) ────────────────────────────────────
// GET /api/v3/backend/orders?updated_since=&after_id=&limit= (legado: agenciafera/movepark-backoffice#614,
// contrato em .claude/specs/api-backend-lista-pedidos.md daquele repo). Paginação por cursor
// (alterado_em, id). Ver docs/specs/reservas-wl-no-hub.md.

export interface WlOrdersCursor {
  updated_since: string;
  after_id: number;
}

export interface WlOrdersPage {
  rows: Record<string, unknown>[];
  nextCursor: WlOrdersCursor;
  hasMore: boolean;
}

export function buildOrdersUrl(domain: string, cursor: WlOrdersCursor, limit: number): string {
  const host = requireWlHost(domain);
  const q = new URLSearchParams({
    updated_since: cursor.updated_since,
    after_id: String(cursor.after_id),
    limit: String(limit),
  });
  return `https://${host}${WL_API_PATH}/orders?${q.toString()}`;
}

/**
 * Lê a resposta da rota. Recusa formato inesperado em vez de devolver página vazia: página vazia
 * com cursor parado é indistinguível de "nada mudou", e a importação ficaria calada para sempre.
 */
export function parseOrdersPage(json: unknown, fallback: WlOrdersCursor): WlOrdersPage {
  const o = (json ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.data)) {
    throw new Error(`resposta sem data[]: ${JSON.stringify(json).slice(0, 200)}`);
  }
  const meta = (o.meta ?? {}) as Record<string, unknown>;
  const next = (meta.next_cursor ?? {}) as Record<string, unknown>;
  const updatedSince = typeof next.updated_since === "string" ? next.updated_since : fallback.updated_since;
  const afterId = Number.isFinite(Number(next.after_id)) ? Number(next.after_id) : fallback.after_id;
  return {
    rows: o.data as Record<string, unknown>[],
    nextCursor: { updated_since: updatedSince, after_id: afterId },
    hasMore: meta.has_more === true,
  };
}

export async function wlListOrders(
  c: WlConfig,
  token: string,
  cursor: WlOrdersCursor,
  limit: number,
): Promise<WlOrdersPage> {
  const res = await wlFetch(buildOrdersUrl(c.wl_domain!, cursor, limit), {
    headers: wlHeaders(c.wl_tenant_key!, token),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new WlHttpError(res.status, `WL orders ${res.status}: ${body.slice(0, 200)}`);
  }
  return parseOrdersPage(await res.json(), cursor);
}

// ── Ações sobre o pedido (fase 4 das reservas do site no Hub) ─────────────────────────────────
// POST /api/v3/backend/order/attendance e /order/license-plate (legado: agenciafera/movepark-backoffice#615,
// contrato em .claude/specs/api-backend-acoes-pedido.md daquele repo). Regra recusada volta 409
// com data.code; aqui isso NÃO vira exceção, porque é resposta esperada que vira mensagem na tela.

export type WlActionResult =
  | { kind: "ok"; status: number; data: Record<string, unknown> }
  | { kind: "refused"; status: number; code: string; message: string };

async function wlPostAction(
  c: WlConfig,
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<WlActionResult> {
  const host = requireWlHost(c.wl_domain);
  const res = await wlFetch(`https://${host}${WL_API_PATH}/${path}`, {
    method: "POST",
    headers: wlHeaders(c.wl_tenant_key!, token),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { kind: "ok", status: res.status, data: (json.data ?? {}) as Record<string, unknown> };
  if (res.status === 409 || res.status === 404 || res.status === 422) {
    const data = (json.data ?? {}) as Record<string, unknown>;
    const code = res.status === 404 ? "not_found" : res.status === 422 ? "invalid" : String(data.code ?? "refused");
    return { kind: "refused", status: res.status, code, message: String(json.message ?? "") };
  }
  throw new WlHttpError(res.status, `WL ${path} ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
}

export function wlMarkAttendance(
  c: WlConfig,
  token: string,
  p: { orderNumber: string; status: "pendente" | "compareceu" | "no_show"; actor?: string | null },
): Promise<WlActionResult> {
  return wlPostAction(c, token, "order/attendance", {
    order_number: p.orderNumber,
    status: p.status,
    actor: p.actor ?? null,
  });
}

export function wlChangeLicensePlate(
  c: WlConfig,
  token: string,
  p: {
    orderNumber: string;
    licensePlate: string;
    reason: string;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    actor?: string | null;
  },
): Promise<WlActionResult> {
  return wlPostAction(c, token, "order/license-plate", {
    order_number: p.orderNumber,
    license_plate: p.licensePlate,
    reason: p.reason,
    brand: p.brand ?? null,
    model: p.model ?? null,
    color: p.color ?? null,
    actor: p.actor ?? null,
  });
}
