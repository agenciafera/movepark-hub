// Helper das suítes de contrato do MCP e da Public API (rodam contra o ambiente vivo).
//
// Por que existem: os cenários F1-F5 e o grupo J de docs/specs/customer/agent-test-scenarios.md
// eram rodados à mão com curl a cada dúvida. São requisição e asserção, sem browser, então viram
// teste. O que se ganha: regressão de deploy (a Edge voltou sem a tool, o proxy caiu, o card ficou
// dessincronizado) passa a ser pega sozinha, em vez de depender de alguém repetir o curl.
//
// Estas suítes NÃO entram no gate `test` (que é offline por princípio): rodam em `bun run test:int`.

/** Superfície MCP pública (proxy Cloudflare). Sobrescreva com MCP_BASE_URL para testar outro ambiente. */
export const MCP_BASE = process.env.MCP_BASE_URL ?? "https://mcp.movepark.co";

/** Public API (proxy Cloudflare, fora da superfície de SEO). */
export const API_BASE = process.env.API_BASE_URL ?? "https://api.movepark.co";

/** Origem canônica do site, onde moram openapi.yaml e os cards de descoberta. */
export const HUB_BASE = process.env.HUB_BASE_URL ?? "https://movepark.co";

/**
 * Edge do assistente do site. É pública por design (`verify_jwt=false`, a bolinha chama anônima),
 * então estas asserções não precisam de credencial.
 */
export const CHAT_BASE = process.env.CHAT_BASE_URL ??
  "https://mgaigbezdalbyuqiofcf.supabase.co/functions/v1/chat";

/** POST no /chat com corpo cru (string), para poder mandar JSON inválido de propósito. */
export async function postChatRaw(body: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(CHAT_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** POST no /chat com um objeto. */
export function postChat(body: unknown) {
  return postChatRaw(JSON.stringify(body));
}

/** Códigos de erro JSON-RPC que o gateway usa (ver supabase/functions/mcp/index.ts). */
export const JSONRPC = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
} as const;

export interface RpcResponse {
  jsonrpc: string;
  id: number;
  result?: {
    tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
    protocolVersion?: string;
    serverInfo?: { name?: string; version?: string };
    capabilities?: unknown;
  };
  error?: { code: number; message: string };
}

/** Chamada JSON-RPC crua. `path` é "" (público), "/customer" ou "/partner". */
export async function rpc(
  path: string,
  method: string,
  params?: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<RpcResponse> {
  const res = await fetch(`${MCP_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
  });
  return (await res.json()) as RpcResponse;
}

/** Nomes das tools de uma superfície. */
export async function toolNames(path: string, headers?: Record<string, string>): Promise<string[]> {
  const r = await rpc(path, "tools/list", undefined, headers);
  return (r.result?.tools ?? []).map((t) => t.name);
}

/** Payload de uma tool bem-sucedida, já parseado (o MCP devolve JSON dentro de content[0].text). */
export function toolPayload<T = unknown>(r: RpcResponse): T {
  const text = r.result?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error(`resposta sem content: ${JSON.stringify(r)}`);
  return JSON.parse(text) as T;
}

/** Mensagem de erro de negócio (isError: true) ou de protocolo (error.message). */
export function errorMessage(r: RpcResponse): string {
  if (r.error) return r.error.message;
  if (r.result?.isError) {
    const p = toolPayload<{ error?: string }>(r);
    return p.error ?? "";
  }
  return "";
}

/**
 * Tools transacionais: nunca podem aparecer na superfície pública (anônima). Lista fixa de
 * propósito, não derivada do código: se alguém mover uma escrita para o registro de leitura, o
 * teste tem que gritar, e derivar da mesma fonte esconderia o erro.
 */
export const TRANSACTIONAL_NAMES = [
  "create_booking",
  "cancel_booking",
  "set_booking_customer",
  "set_booking_vehicle",
  "add_vehicle",
  "list_my_bookings",
  "get_booking",
  "get_booking_status",
  "create_checkout_link",
  "request_login_otp",
  "verify_login_otp",
  "whoami",
];
