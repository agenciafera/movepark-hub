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
/**
 * `perfil` só aparece quando a credencial foi ACEITA.
 *
 * Sem essa condição o `initialize` viraria serviço gratuito de triagem de chave
 * vazada: quem achasse uma descobriria de graça se ela ainda vale e se é de
 * plataforma, num método que não exige autenticação e não tem rate limit.
 * Com ela, a resposta é idêntica para chave boa, ruim e ausente até o momento em
 * que a chave prova ser boa.
 */
export function initializeResult(
  serverName: string,
  clientProtocol?: string,
  perfil?: string | null,
) {
  return {
    protocolVersion: clientProtocol ?? MCP_PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: serverName, version: SERVER_VERSION },
    ...(perfil ? { perfil } : {}),
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

/**
 * Frases internas do Postgres/PostgREST. Todas em inglês; as mensagens de app são
 * em português e nunca batem em nenhuma delas. Uma mensagem SEM SQLSTATE que casa
 * aqui veio de um erro do supabase-js re-lançado (`throw new Error(error.message)`),
 * e não de um handler nosso: tabela, coluna, constraint, policy e schema não podem
 * vazar por esse caminho.
 */
const POSTGRES_INTERNO =
  /violat|permission denied|row[- ]?level security|does not exist|duplicate key|constraint|syntax error|invalid input syntax|null value in column|relation "|column "|schema "|type "|\bPGRST|JWSError|JWT (?:expired|invalid)|invalid JWT/i;

// Mensagem segura de erro para o cliente (espelha o pgErrorToHttp do gateway REST). Com SQLSTATE:
// só P0001 (RAISE de negócio das RPCs) é propagado; qualquer outro erro do Postgres (unique/check/
// FK/uuid inválido/not-null) vira genérico. Sem SQLSTATE normalmente é `throw new Error("...")` de
// um handler (mensagem nossa, segura), MAS o re-throw do supabase-js também perde o code e carrega
// internals; por isso a mensagem sem code passa pelo filtro `POSTGRES_INTERNO` antes de sair.
export function safeToolError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const generico = "Erro ao executar a operação.";
  const code = err?.code;
  if (code) {
    if (code === "P0001") return err.message ?? "Requisição inválida.";
    if (code === "23505") return "Registro já existe (conflito de unicidade).";
    if (["22P02", "22007", "22008", "22003", "23502", "23503", "23514"].includes(code)) {
      return "Parâmetro inválido para esta operação.";
    }
    return generico;
  }
  const msg = err?.message;
  if (!msg) return generico;
  return POSTGRES_INTERNO.test(msg) ? generico : msg;
}
