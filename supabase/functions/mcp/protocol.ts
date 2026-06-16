// MCP server — camada de protocolo JSON-RPC 2.0 / Model Context Protocol.
// Lógica pura (sem rede) — testável com deno test. Ver docs/specs/mcp.md.

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const SERVER_VERSION = "1.0.0";

// Códigos JSON-RPC 2.0
export const JSONRPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcId = string | number | null;

export function isJsonRpcRequest(v: unknown): v is JsonRpcRequest {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    typeof (v as { method?: unknown }).method === "string"
  );
}

export function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0" as const,
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

// Resultado de `initialize` (handshake MCP).
export function initializeResult(serverName: string, clientProtocol?: string) {
  return {
    protocolVersion: clientProtocol ?? MCP_PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: serverName, version: SERVER_VERSION },
  };
}

// Conteúdo de `tools/call` — texto único com o JSON do resultado.
export function toolTextContent(data: unknown, isError = false) {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
    isError,
  };
}

// `notifications/*` não têm id → não devem receber resposta.
export function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined || req.method.startsWith("notifications/");
}
