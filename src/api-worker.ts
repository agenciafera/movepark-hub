// Cloudflare Worker da plataforma de borda do Movepark (E0.7). Serve dois domínios:
//   api.movepark.co  → Public API REST (Edge Function `api`, gateway /v1/* por chave + escopo)
//   mcp.movepark.co  → Servidor MCP (Edge Function `mcp`): / = consumidor (anon),
//                      /partner = parceiro (Authorization: Bearer mp_…)
// Esconde a URL crua do Supabase e injeta o header `apikey` (anon) que o gateway exige.
// Ver docs/specs/public-api.md e docs/specs/mcp.md.

interface Env {
  SUPABASE_FUNCTIONS_URL: string; // ex.: https://<ref>.supabase.co/functions/v1
  SUPABASE_ANON_KEY: string; // injetado como `apikey` na borda (secret)
  SITE_URL?: string; // ex.: https://hub.movepark.co (fonte do openapi.yaml)
  API_RATELIMIT?: KVNamespace; // opcional: rate-limit best-effort por prefixo de chave
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type, idempotency-key, x-request-id, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const RATE_LIMIT_PER_MIN = 60;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // mcp.movepark.co → servidor MCP
    if (url.hostname.startsWith("mcp.")) {
      return handleMcp(request, env, url);
    }
    // api.movepark.co (default) → Public API REST
    return handleApi(request, env, url);
  },
};

// ── MCP (mcp.movepark.co) ────────────────────────────────────────────────────
async function handleMcp(request: Request, env: Env, url: URL): Promise<Response> {
  // "/" → /mcp (consumidor); "/partner" → /mcp/partner
  const sub = url.pathname === "/" ? "" : url.pathname;
  const target = env.SUPABASE_FUNCTIONS_URL.replace(/\/$/, "") + "/mcp" + sub + url.search;

  const headers = new Headers(request.headers);
  headers.set("apikey", env.SUPABASE_ANON_KEY);
  headers.delete("host");

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  });
  return withCors(upstream);
}

// ── Public API REST (api.movepark.co) ────────────────────────────────────────
async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/" || url.pathname === "") {
    return Response.redirect(new URL("/docs", url).toString(), 302);
  }
  if (url.pathname === "/docs") {
    return new Response(docsHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
    });
  }
  if (url.pathname === "/openapi.yaml" || url.pathname === "/openapi.json") {
    const site = env.SITE_URL ?? "https://hub.movepark.co";
    const res = await fetch(new URL(url.pathname, site).toString());
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": "application/yaml; charset=utf-8", ...CORS },
    });
  }

  if (!url.pathname.startsWith("/v1")) {
    return json({ error: { code: "not_found", message: "Recurso não encontrado." } }, 404);
  }

  const key = bearer(request);
  if (env.API_RATELIMIT && key) {
    const limited = await rateLimited(env.API_RATELIMIT, key.slice(0, 16));
    if (limited) {
      return json({ error: { code: "rate_limited", message: "Limite de requisições excedido." } }, 429, {
        "Retry-After": "60",
      });
    }
  }

  const target = new URL(env.SUPABASE_FUNCTIONS_URL.replace(/\/$/, "") + "/api" + url.pathname + url.search);
  const headers = new Headers(request.headers);
  headers.set("apikey", env.SUPABASE_ANON_KEY);
  if (!headers.get("Authorization") && key) headers.set("Authorization", `Bearer ${key}`);
  headers.set("x-request-id", request.headers.get("x-request-id") ?? crypto.randomUUID());
  headers.delete("host");

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  });
  return withCors(upstream);
}

function withCors(upstream: Response): Response {
  const respHeaders = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

function bearer(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return request.headers.get("X-API-Key");
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

async function rateLimited(kv: KVNamespace, prefix: string): Promise<boolean> {
  const bucket = `rl:${prefix}`;
  const current = parseInt((await kv.get(bucket)) ?? "0", 10);
  if (current >= RATE_LIMIT_PER_MIN) return true;
  await kv.put(bucket, String(current + 1), { expirationTtl: 60 });
  return false;
}

function docsHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Movepark — API pública</title>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.yaml"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
