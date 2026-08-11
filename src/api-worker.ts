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
  /*
    Allowlist de superfície.

    Isto era passthrough cego: qualquer path virava `/mcp<path>` e quem decidia
    era a Edge. Com a raiz resolvendo perfil pela credencial, path inventado não
    pode nem chegar lá, senão um `/mcp/qualquercoisa` novo vira superfície por
    acidente no dia em que alguém acrescentar um sufixo no servidor.
  */
  const rota = url.pathname.replace(/\/+$/, "") || "/";
  if (!SUPERFICIES_MCP.has(rota)) {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Superfície desconhecida." } },
      404,
    );
  }

  /*
    Freio de borda por NOME DE TOOL, e não por path.

    Antes ele valia só para o path `/customer`, o que deixava de valer no dia em
    que a mesma tool fosse chamada pela raiz. O que custa dinheiro é
    `request_login_otp` (WhatsApp e e-mail), então é ela que se freia, venha por
    onde vier.

    Este é o freio EXTERNO, e ele é contornável: a Edge é `verify_jwt = false` e
    o ref do projeto é público, então dá para chamar o Supabase direto. A defesa
    real é a do banco (`otp_request_allowed`), que todo caminho atravessa. Aqui é
    só a primeira barreira, para o tráfego óbvio não chegar a acordar a Edge.
  */
  const corpoBruto = request.method === "POST" ? await request.clone().text() : "";
  const toolPedida = nomeDaTool(corpoBruto);
  if (env.API_RATELIMIT && TOOLS_FREADAS.has(toolPedida)) {
    const ip = clientIp(request);
    if (ip) {
      const limited = await rateLimited(env.API_RATELIMIT, `mcpc:${ip}`);
      if (limited) {
        return json(
          { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Limite de requisições excedido." } },
          429,
          { "Retry-After": "60" },
        );
      }
    }
  }

  // "/" → /mcp (a raiz, que resolve o perfil pela credencial); "/partner" → /mcp/partner…
  const sub = rota === "/" ? "" : rota;
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

function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
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

/**
 * Superfícies que existem. Path fora daqui não chega na Edge.
 */
const SUPERFICIES_MCP = new Set(["/", "/public", "/partner", "/customer", "/manager"]);

/**
 * Tools que custam dinheiro ou criam conta, e por isso passam pelo freio de
 * borda. Não é lista de segurança: é lista de custo. Quem protege de verdade é
 * o `otp_request_allowed`, no banco.
 */
const TOOLS_FREADAS = new Set(["request_login_otp", "verify_login_otp"]);

/** Nome da tool pedida, lido do corpo JSON-RPC. String vazia quando não é um. */
function nomeDaTool(corpo: string): string {
  if (!corpo) return "";
  try {
    const d = JSON.parse(corpo) as { method?: string; params?: { name?: string } };
    return d.method === "tools/call" ? (d.params?.name ?? "") : "";
  } catch {
    return "";
  }
}

/**
 * Contador de janela fixa.
 *
 * `get` e depois `put` não é atômico, e o KV é eventualmente consistente por
 * PoP: N requisições paralelas leem o mesmo valor e passam todas, e o limite
 * vale por ponto de presença. Ou seja, ele não segura um atacante distribuído,
 * e não é para isso que existe.
 *
 * Mantido assim de propósito: trocar por Durable Object custaria latência em
 * toda request para proteger algo que já tem defesa própria no banco. Se um dia
 * a borda precisar ser a defesa real, é aqui que a conversa começa.
 */
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
/**
 * Página para humano, no GET do `mcp.movepark.co`.
 *
 * Ela **não** lista tools. Listava, em três tabelas de 26 linhas escritas à mão,
 * e mentia: dizia "três superfícies" depois que virou quatro, e não citava a
 * `search_knowledge` que o teste de integração exige existir. Nenhum guard
 * pegava, porque não havia guard.
 *
 * Quem descreve tools são os cards, que já são conferidos pelo `lint:openapi`
 * (registro ↔ card, nas duas direções, mais o sha256 no índice de agent-skills).
 * Aqui fica só o que os cards não dizem: qual credencial vira qual perfil.
 * `api-worker.contract.test.ts` impede que a duplicação volte.
 */
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
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Movepark · MCP</h1>
  <p class="sub">Servidor <strong>Model Context Protocol</strong> (Streamable HTTP / JSON-RPC 2.0).
     Uma URL só: o que você manda no cabeçalho decide o que você enxerga.</p>

  <h2>Uma URL, quatro perfis</h2>
  <p>Aponte seu cliente para <code>https://mcp.movepark.co</code>. A credencial escolhe o perfil.</p>
  <table>
    <tr><th>O que você manda</th><th>Perfil</th><th>Tools</th></tr>
    <tr><td>nada</td><td>Consumidor</td>
        <td><a href="https://hub.movepark.co/.well-known/mcp/server-card.json">server-card.json</a></td></tr>
    <tr><td><code>Authorization: Bearer &lt;access_token&gt;</code></td><td>Consumidor autenticado</td>
        <td><a href="https://hub.movepark.co/.well-known/mcp/customer-card.json">customer-card.json</a></td></tr>
    <tr><td><code>Authorization: Bearer mp_…</code></td><td>Parceiro</td>
        <td><a href="https://hub.movepark.co/.well-known/mcp/partner-card.json">partner-card.json</a></td></tr>
  </table>
  <p>O login do consumidor é por código no WhatsApp ou e-mail, com as tools
     <code>request_login_otp</code> e <code>verify_login_otp</code>. O pagamento fica fora do MCP:
     o agente monta a reserva e entrega um link de checkout que já cai logado.</p>

  <h2>Conectar</h2>
  <pre>curl -s https://mcp.movepark.co \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</pre>
  <p>Com chave de parceiro, a lista muda conforme os escopos dela:</p>
  <pre>curl -s https://mcp.movepark.co \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer mp_live_…' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"list_bookings","arguments":{"limit":10}}}'</pre>
  <p>Prefere declarar a superfície em vez de deduzir? Os caminhos
     <code>/public</code>, <code>/partner</code> e <code>/customer</code> continuam valendo, e aí a
     credencial precisa casar com o que você pediu.</p>

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
