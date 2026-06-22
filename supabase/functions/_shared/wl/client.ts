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

/** A resposta do WL pode vir como [...], {data:[...]} ou {days:[...]}; normaliza tudo. */
export function parseAvailabilityResponse(json: unknown): WlAvailabilityDay[] {
  let arr: unknown = json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    arr = o.data ?? o.days ?? o.availability ?? [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      date: String(r.date ?? ""),
      capacity: Number(r.capacity ?? 0),
      sold_wl: Number(r.sold_wl ?? 0),
      sold_external: Number(r.sold_external ?? 0),
      available: Number(r.available ?? 0),
    };
  });
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
  return parseAvailabilityResponse(await res.json());
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
