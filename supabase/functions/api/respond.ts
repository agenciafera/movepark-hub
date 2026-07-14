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
// Regra de vazamento: só propagamos a mensagem quando ela é NOSSA (RAISE das RPCs, code P0001);
// para erros internos do Postgres (unique/check/fk/uuid inválido/etc.) devolvemos uma mensagem
// genérica, pra não vazar nome de constraint, coluna ou schema para o cliente.
export function pgErrorToHttp(err: PgError): { status: number; code: string; message: string } {
  // Erros de negócio levantados pelas RPCs (RAISE ... 'P0001'): a mensagem é nossa e segura.
  if (err.code === "P0001") {
    const message = err.message ?? "Requisição inválida.";
    if (/não encontrad|nao encontrad/i.test(message)) {
      return { status: 404, code: "not_found", message };
    }
    return { status: 422, code: "validation_error", message };
  }
  // Permissão negada (assert de empresa ou grant): 403 sem detalhar.
  if (err.code === "42501") {
    return { status: 403, code: "forbidden", message: "Operação não permitida para esta empresa." };
  }
  // Conflito de unicidade (ex.: código de cupom repetido) → 409, sem vazar o constraint.
  if (err.code === "23505") {
    return { status: 409, code: "conflict", message: "Registro já existe (conflito de unicidade)." };
  }
  // Entrada malformada do cliente: uuid/data/número inválidos, not-null, FK, check → 422.
  if (["22P02", "22007", "22008", "22003", "23502", "23503", "23514"].includes(err.code ?? "")) {
    return { status: 422, code: "validation_error", message: "Parâmetro inválido para esta operação." };
  }
  // Qualquer outro erro do Postgres → 500 genérico (nunca a mensagem crua).
  return { status: 500, code: "internal", message: "Erro interno." };
}
