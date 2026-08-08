// Cliente do backend white-label legado (integração de disponibilidade · E2.5.1).
//
// O path da API é fixo (/api/v3/backend); por empresa variam o domínio (host) e o
// tenant (header X-Tenant). O Bearer é GLOBAL e vem do env WL_BACKEND_TOKEN — nunca
// trafega o front. Resolve-se a config por empresa via RPC wl_company_config / service-role.

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

/** A empresa está pronta para sincronizar (toggle ligado + domínio + tenant). */
export function wlReady(c: WlConfig | null | undefined): boolean {
  return !!c && !!c.wl_sync_enabled && !!normalizeWlDomain(c.wl_domain) && !!c.wl_tenant_key;
}

export function buildAvailabilityUrl(domain: string, p: AvailabilityParams): string {
  const host = normalizeWlDomain(domain);
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
 * correspondente — evita misturar/sobrescrever o `sold_wl` de outro produto por data.
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
  const res = await fetch(buildAvailabilityUrl(c.wl_domain!, p), {
    headers: wlHeaders(c.wl_tenant_key!, token),
  });
  if (!res.ok) throw new Error(`WL availability ${res.status}`);
  return parseAvailabilityResponse(await res.json(), p.product_slug);
}

export async function wlPostSync(
  c: WlConfig,
  token: string,
  body: SyncBody,
): Promise<{ status?: string }> {
  const host = normalizeWlDomain(c.wl_domain);
  const res = await fetch(`https://${host}${WL_API_PATH}/availability/sync`, {
    method: "POST",
    headers: wlHeaders(c.wl_tenant_key!, token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WL sync ${res.status}: ${JSON.stringify(json)}`);
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
  const host = normalizeWlDomain(c.wl_domain);
  const res = await fetch(`https://${host}${WL_PUBLIC_PATH}/categories?lang=pt-br`, {
    headers: publicHeaders(),
  });
  if (!res.ok) throw new Error(`WL categories ${res.status}`);
  return parseCategories(await res.json());
}

export async function wlGetCategoryProducts(c: WlConfig, categorySlug: string): Promise<WlProduct[]> {
  const host = normalizeWlDomain(c.wl_domain);
  const res = await fetch(
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
//   1. `X-Tenant` é OBRIGATÓRIO. Sem ele o October devolve 500 com página de exceção em HTML,
//      não JSON, e o erro não diz o que faltou.
//   2. A data é `Y-m-d H:i:s`, com os dois-pontos percent-encoded. Qualquer outro formato
//      (ISO com "T", ou só a data) devolve 400 nomeando o campo.

export interface WlPriceQuote {
  price: number;
  oldPrice: number | null;
  /** Como o WL decompôs a duração (ex.: `1_1_i0_h21_d8_m0_y0`). Útil no log da amostragem. */
  offerCode: string | null;
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
  const host = normalizeWlDomain(domain);
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
  const res = await fetch(buildCalculationPriceUrl(c.wl_domain!, p), {
    headers: { Accept: "application/json", "X-Tenant": c.wl_tenant_key! },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`WL calculation-price ${res.status}: ${body.slice(0, 300)}`);
  }
  return parseCalculationPrice(JSON.parse(body));
}
