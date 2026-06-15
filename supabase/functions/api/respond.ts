// Public API gateway — envelope de resposta e mapeamento de erro.
// Lógica pura (sem rede) — testável com deno test.

export interface PgError {
  code?: string; // SQLSTATE (ex.: '42501', 'P0001')
  message?: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function corsHeaders(): Record<string, string> {
  return { ...CORS };
}

export function ok(data: unknown, requestId: string, status = 200, extraMeta: Record<string, unknown> = {}) {
  return json({ data, meta: { request_id: requestId, ...extraMeta } }, status, requestId);
}

export function fail(code: string, message: string, status: number, requestId: string) {
  return json({ error: { code, message, request_id: requestId } }, status, requestId);
}

function json(body: unknown, status: number, requestId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "x-request-id": requestId },
  });
}

// Mapeia o erro vindo de uma RPC plpgsql para {status, code, message} HTTP.
export function pgErrorToHttp(err: PgError): { status: number; code: string; message: string } {
  const message = err.message ?? "Erro interno";
  if (err.code === "42501") return { status: 403, code: "forbidden", message };
  if (err.code === "P0001") {
    if (/não encontrad|nao encontrad/i.test(message)) {
      return { status: 404, code: "not_found", message };
    }
    return { status: 422, code: "validation_error", message };
  }
  return { status: 500, code: "internal", message };
}
