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
  // Browser (Accept: text/html) → página de documentação; clientes MCP usam POST (JSON-RPC).
  const accept = request.headers.get("Accept") ?? "";
  if (request.method === "GET" && accept.includes("text/html")) {
    return new Response(mcpDocsHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
    });
  }
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
    <title>Movepark | API pública</title>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.yaml"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

// Página de documentação do servidor MCP (mcp.movepark.co) para humanos.
function mcpDocsHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Movepark | MCP</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 820px;
           margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    h1 { margin-bottom: .25rem; } .sub { color: #6b7280; margin-top: 0; }
    h2 { margin-top: 2.25rem; border-bottom: 1px solid #8883; padding-bottom: .3rem; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { background: #8881; padding: .9rem 1rem; border-radius: 8px; overflow-x: auto; font-size: 13px; }
    table { border-collapse: collapse; width: 100%; font-size: 14px; }
    th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #8883; vertical-align: top; }
    .pill { display: inline-block; background: #8882; border-radius: 999px; padding: .1rem .6rem; font-size: 12px; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Movepark · MCP</h1>
  <p class="sub">Servidor <strong>Model Context Protocol</strong> (Streamable HTTP / JSON-RPC 2.0).
     Duas superfícies: <strong>consumidor</strong> (público) e <strong>parceiro</strong> (autenticado).</p>

  <h2>Endpoints</h2>
  <table>
    <tr><th>Superfície</th><th>URL</th><th>Auth</th><th>Card</th></tr>
    <tr><td>Consumidor</td><td><code>https://mcp.movepark.co</code></td><td>—</td>
        <td><a href="https://hub.movepark.co/.well-known/mcp/server-card.json">server-card.json</a></td></tr>
    <tr><td>Parceiro</td><td><code>https://mcp.movepark.co/partner</code></td>
        <td><code>Authorization: Bearer mp_…</code></td>
        <td><a href="https://hub.movepark.co/.well-known/mcp/partner-card.json">partner-card.json</a></td></tr>
  </table>

  <h2>Conectar</h2>
  <p>Clientes MCP usam <strong>POST</strong> com JSON-RPC. Exemplo (<code>tools/list</code>):</p>
  <pre>curl -s https://mcp.movepark.co \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</pre>
  <p>Parceiro (a chave define as tools visíveis, por escopo):</p>
  <pre>curl -s https://mcp.movepark.co/partner \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer mp_live_…' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"list_bookings","arguments":{"limit":10}}}'</pre>

  <h2>Tools: consumidor (público)</h2>
  <table>
    <tr><th>Tool</th><th>Descrição</th></tr>
    <tr><td><code>search_parking</code></td><td>Busca estacionamentos por destino e período.</td></tr>
    <tr><td><code>simulate_price</code></td><td>Simula o preço de uma reserva.</td></tr>
    <tr><td><code>get_faq</code></td><td>Perguntas frequentes (global/unidade).</td></tr>
    <tr><td><code>list_companies</code></td><td>Estacionamentos parceiros.</td></tr>
    <tr><td><code>list_locations</code></td><td>Unidades públicas.</td></tr>
    <tr><td><code>get_parking_types</code></td><td>Tipos de vaga de uma unidade.</td></tr>
  </table>

  <h2>Tools: parceiro (chave + escopo)</h2>
  <p>As tools visíveis dependem dos <span class="pill">escopos</span> da chave (gerencie em
     <code>/operator/api-keys</code>).</p>
  <table>
    <tr><th>Tool</th><th>Escopo</th></tr>
    <tr><td><code>list_locations</code> / <code>get_location</code></td><td>locations:read</td></tr>
    <tr><td><code>list_parking_types</code></td><td>parking-types:read</td></tr>
    <tr><td><code>get_availability</code></td><td>availability:read</td></tr>
    <tr><td><code>simulate_price</code></td><td>pricing:read</td></tr>
    <tr><td><code>list_bookings</code> / <code>get_booking</code></td><td>bookings:read</td></tr>
    <tr><td><code>create_booking</code></td><td>bookings:write</td></tr>
    <tr><td><code>cancel_booking</code></td><td>bookings:cancel</td></tr>
    <tr><td><code>check_in_booking</code> / <code>check_out_booking</code></td><td>bookings:checkin</td></tr>
  </table>

  <h2>Mais</h2>
  <p>API REST (OpenAPI): <a href="https://api.movepark.co/docs">api.movepark.co/docs</a> ·
     Catálogo: <a href="https://hub.movepark.co/.well-known/api-catalog">/.well-known/api-catalog</a></p>
</body>
</html>`;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
