// Public API gateway — roteamento puro (método + path → handler/escopo/params).
// Sem rede — testável com deno test.

export interface RouteMatch {
  handler: string;
  scope: string;
  params: Record<string, string>;
}

interface RouteDef {
  method: string;
  regex: RegExp;
  keys: string[];
  scope: string;
  handler: string;
}

// Cada rota é declarada com seu escopo exigido (espelha api_scope/OpenAPI).
const ROUTES: RouteDef[] = [
  def("GET", "/v1/locations", [], "locations:read", "list_locations"),
  def("GET", "/v1/locations/:id", ["id"], "locations:read", "get_location"),
  def("GET", "/v1/locations/:id/parking-types", ["id"], "parking-types:read", "list_parking_types"),
  def("GET", "/v1/availability", [], "availability:read", "availability"),
  def("POST", "/v1/pricing/simulate", [], "pricing:read", "simulate_price"),
  def("GET", "/v1/bookings", [], "bookings:read", "list_bookings"),
  def("GET", "/v1/bookings/:id", ["id"], "bookings:read", "get_booking"),
  def("POST", "/v1/bookings", [], "bookings:write", "create_booking"),
  def("POST", "/v1/bookings/:id/cancel", ["id"], "bookings:cancel", "cancel_booking"),
  def("POST", "/v1/bookings/:id/check-in", ["id"], "bookings:checkin", "checkin_booking"),
  def("POST", "/v1/bookings/:id/check-out", ["id"], "bookings:checkin", "checkout_booking"),
  def("GET", "/v1/faq", [], "faq:read", "faq"),
];

function def(method: string, pattern: string, keys: string[], scope: string, handler: string): RouteDef {
  const regex = new RegExp(
    "^" + pattern.replace(/:[A-Za-z_]+/g, "([^/]+)").replace(/\//g, "\\/") + "\\/?$",
  );
  return { method, regex, keys, scope, handler };
}

// Extrai o caminho normalizado ("/v1/...") da URL do edge function (que vem como
// /functions/v1/api/v1/...). Pega tudo a partir do último "/v1".
export function normalizePath(pathname: string): string {
  const i = pathname.lastIndexOf("/v1");
  return i >= 0 ? pathname.slice(i) : pathname;
}

export function matchRoute(method: string, pathname: string): RouteMatch | null {
  const path = normalizePath(pathname);
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = path.match(r.regex);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, idx) => (params[k] = decodeURIComponent(m[idx + 1])));
    return { handler: r.handler, scope: r.scope, params };
  }
  return null;
}

// Indica se existe alguma rota para o path (independente do método) — para 404 vs 405.
export function pathExists(pathname: string): boolean {
  const path = normalizePath(pathname);
  return ROUTES.some((r) => r.regex.test(path));
}
