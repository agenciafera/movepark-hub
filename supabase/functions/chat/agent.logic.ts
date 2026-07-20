// Lógica pura do agente de chat (Gemini function-calling), testável sem rede (E3.3).
// As funções aqui NÃO fazem fetch — só definem as tools, formatam o histórico no shape do
// Gemini, roteiam nomes de tool e controlam o loop. A chamada à Gemini e o dispatch impuro
// (RPCs/Edges) ficam no index.ts. Ver docs/specs/chatbot.md.

import { READ_TOOLS, toGeminiDecl } from "../_shared/assistant-tools.ts";

// Data/hora vive no registro compartilhado (o handler de current_datetime está lá).
// Reexportado aqui porque temporalSystemBlock e os testes deste módulo já o usavam.
export { DEFAULT_TZ, nowContext } from "../_shared/assistant-tools.ts";
export type { NowContext } from "../_shared/assistant-tools.ts";
import { nowContext as nowCtx, DEFAULT_TZ as TZ } from "../_shared/assistant-tools.ts";

// ── Tipos do wire Gemini (v1beta generateContent) ───────────────────────────
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}
export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: { name: string; response: Record<string, unknown> };
}
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

// ── Catálogo de tools (espelha o MCP consumidor + transacionais) ─────────────
export interface ToolDecl {
  name: string;
  description: string;
  // JSON Schema (subconjunto OpenAPI do Gemini) — sem additionalProperties.
  parameters: Record<string, unknown>;
  // true = exige usuário logado (reserva/cancelamento/minhas reservas).
  transactional?: boolean;
}

const STR = (description: string) => ({ type: "string", description });
const NUM = (description: string) => ({ type: "number", description });
function obj(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required };
}

export const TOOLS: ToolDecl[] = [
  // Leitura: registro canônico em _shared/assistant-tools.ts, o mesmo que o MCP
  // consumidor consome. Não declare tool de leitura aqui — ela divergiria do MCP.
  ...READ_TOOLS.map(toGeminiDecl),
  // ── Transacionais (exigem login) ──
  {
    name: "list_my_bookings",
    description: "Lista as reservas do usuário logado.",
    parameters: obj({ limit: NUM("máximo") }),
    transactional: true,
  },
  {
    name: "get_booking",
    description: "Detalhe de uma reserva do usuário pelo código (MP-...).",
    parameters: obj({ booking_code: STR("código da reserva, ex.: MP-AB12CD") }, ["booking_code"]),
    transactional: true,
  },
  {
    name: "create_booking",
    description:
      "Cria uma reserva para o usuário logado. Use os ids vindos de get_parking_types. Confirme com o usuário antes de reservar.",
    parameters: obj(
      {
        location_parking_type_id: STR("id do tipo de vaga (location_parking_type)"),
        check_in_at: STR("Check-in ISO-8601"),
        check_out_at: STR("Check-out ISO-8601"),
        vehicle_id: STR("id do veículo do usuário (opcional)"),
        coupon_code: STR("cupom (opcional)"),
      },
      ["location_parking_type_id", "check_in_at", "check_out_at"],
    ),
    transactional: true,
  },
  {
    name: "cancel_booking",
    description: "Cancela uma reserva do usuário pelo código. Confirme com o usuário antes de cancelar.",
    parameters: obj({ booking_code: STR("código da reserva"), reason: STR("motivo (opcional)") }, ["booking_code"]),
    transactional: true,
  },
  // Completam o fluxo de reserva. Executam pelo MCP /customer (mcp/customer.logic.ts CUSTOMER_TXN_TOOLS);
  // o drift guard garante que todo nome transacional daqui existe lá.
  {
    name: "set_booking_customer",
    description:
      "Preenche os dados do pagador na reserva (CPF/CNPJ e telefone são exigidos no pagamento). Campos ausentes ficam como estão.",
    parameters: obj(
      {
        booking_code: STR("código da reserva (MP-...)"),
        tax_id: STR("CPF ou CNPJ do pagador"),
        phone: STR("telefone com DDD (E.164)"),
        email: STR("e-mail do pagador"),
        first_name: STR("nome"),
        last_name: STR("sobrenome"),
      },
      ["booking_code"],
    ),
    transactional: true,
  },
  {
    name: "add_vehicle",
    description: "Cadastra um veículo do usuário pela placa. Devolve o vehicle_id para vincular à reserva.",
    parameters: obj(
      { license_plate: STR("placa"), model: STR("modelo (opcional)"), color: STR("cor (opcional)") },
      ["license_plate"],
    ),
    transactional: true,
  },
  {
    name: "set_booking_vehicle",
    description: "Vincula um veículo já cadastrado (vehicle_id) à reserva.",
    parameters: obj(
      { booking_code: STR("código da reserva (MP-...)"), vehicle_id: STR("id do veículo") },
      ["booking_code", "vehicle_id"],
    ),
    transactional: true,
  },
  {
    name: "get_booking_status",
    description: "Estado da reserva e do pagamento, para acompanhar a confirmação.",
    parameters: obj({ booking_code: STR("código da reserva (MP-...)") }, ["booking_code"]),
    transactional: true,
  },
];

export const TRANSACTIONAL = new Set(TOOLS.filter((t) => t.transactional).map((t) => t.name));

// As transacionais que já tinham caminho direto (Edge) antes de rotear pelo MCP. Só estas fazem
// fallback: se o MCP cair no transporte, o bot ainda conclui pela via antiga (rollout sem quebrar).
export const LEGACY_TXN = new Set(["create_booking", "cancel_booking", "list_my_bookings", "get_booking"]);

/** Falha de TRANSPORTE ao falar com o MCP (rede/HTTP), que dispara o fallback. Erro de negócio não. */
export class McpTransportError extends Error {}

/**
 * Interpreta a resposta JSON-RPC de um `tools/call` do MCP. Puro: separa falha de transporte (dispara
 * fallback) de erro de negócio (propaga como erro normal, sem fallback) e devolve o payload no sucesso.
 */
export function parseMcpToolResult(
  httpOk: boolean,
  data: unknown,
): unknown {
  if (!httpOk) throw new McpTransportError("MCP indisponível");
  const d = (data ?? {}) as {
    error?: { message?: string };
    result?: { isError?: boolean; content?: Array<{ text?: string }> };
  };
  // Erro de protocolo JSON-RPC (param faltando, tool indisponível): erro de negócio, sem fallback.
  if (d.error) throw new Error(d.error.message ?? "Erro na ferramenta.");
  const text = d.result?.content?.[0]?.text;
  const payload = typeof text === "string" ? safeJsonParse(text) : d.result;
  if (d.result?.isError) {
    const msg = (payload as { error?: string } | null)?.error ?? (typeof text === "string" ? text : "Erro na ferramenta.");
    throw new Error(msg);
  }
  return payload;
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Bloco `tools` do request Gemini (functionDeclarations). */
export function geminiTools() {
  return [{ functionDeclarations: TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters })) }];
}

/** Limite de rodadas de tool-call (anti-loop). */
export const MAX_TOOL_ROUNDS = 6;
export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_SYSTEM_PROMPT =
  "Você é o assistente virtual da Movepark, um marketplace de estacionamentos perto de aeroportos e terminais. " +
  "Responda em português do Brasil, curto e cordial. Escreva sempre a marca como \"Movepark\". " +
  "Nunca invente preço, disponibilidade, unidades ou destinos: use as ferramentas para qualquer dado concreto. " +
  "Se o usuário citar uma empresa (ex.: Aerovalet, Virapark), use list_locations com o slug dela para mostrar " +
  "onde ela atua e ajudar a escolher a unidade. Para datas relativas como semana que vem, amanhã ou próximo " +
  "fim de semana, resolva com current_datetime e proponha datas específicas para o usuário confirmar, sem " +
  "exigir as datas exatas. Para reservar ou cancelar, use as ferramentas transacionais; se o usuário não " +
  "estiver logado, peça que ele entre (o app mostra um botão Entrar). Confirme unidade, datas e valor antes " +
  "de criar ou cancelar uma reserva.";

// ── Histórico vindo do cliente → Content[] do Gemini ─────────────────────────
export type ClientRole = "user" | "model" | "assistant";
export interface ClientTurn {
  role: ClientRole;
  text: string;
}
export interface ChatRequest {
  messages: ClientTurn[];
}

/** Valida { messages: [{role, text}] }. Última mensagem precisa ser do usuário. */
export function parseChatRequest(body: unknown): { ok: true; value: ChatRequest } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return { ok: false, error: "messages é obrigatório (array não vazio)." };
  }
  const turns: ClientTurn[] = [];
  for (const m of b.messages) {
    const mm = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    const role: ClientRole = mm.role === "model" || mm.role === "assistant" ? "model" : "user";
    const text = typeof mm.text === "string" ? mm.text : typeof mm.content === "string" ? mm.content : "";
    if (text.trim()) turns.push({ role, text: text.trim() });
  }
  if (turns.length === 0) return { ok: false, error: "Nenhuma mensagem com texto." };
  if (turns[turns.length - 1].role !== "user") return { ok: false, error: "A última mensagem deve ser do usuário." };
  if (turns.length > 40) return { ok: false, error: "Histórico muito longo (máx 40 mensagens)." };
  return { ok: true, value: { messages: turns } };
}

/** Converte o histórico simples do cliente no shape de contents do Gemini. */
export function toGeminiHistory(turns: ClientTurn[]): GeminiContent[] {
  return turns.map((t) => ({
    role: t.role === "user" ? "user" : "model",
    parts: [{ text: t.text }],
  }));
}

/** Extrai os functionCall de um content do modelo. */
export function extractFunctionCalls(content: GeminiContent | undefined | null): GeminiFunctionCall[] {
  return (content?.parts ?? []).map((p) => p.functionCall).filter((c): c is GeminiFunctionCall => !!c);
}

/** Concatena o texto de um content do modelo. */
export function extractText(content: GeminiContent | undefined | null): string {
  return (content?.parts ?? [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

/** Monta o content `user` com os functionResponse de cada tool executada. */
export function functionResponseContent(
  results: Array<{ name: string; response: Record<string, unknown> }>,
): GeminiContent {
  return { role: "user", parts: results.map((r) => ({ functionResponse: { name: r.name, response: r.response } })) };
}

/** true se a tool exige login e o usuário não está autenticado. */
export function needsLogin(toolName: string, isLoggedIn: boolean): boolean {
  return TRANSACTIONAL.has(toolName) && !isLoggedIn;
}

/** Bloco de contexto temporal acrescentado ao system prompt a cada turno. */
export function temporalSystemBlock(now: Date, timeZone = TZ): string {
  const n = nowCtx(now, timeZone);
  return (
    `\n\n[Contexto temporal] Agora é ${n.weekday}, ${n.date}, ${n.time} (${n.timezone}; ISO ${n.iso}). ` +
    "Resolva datas relativas você mesmo a partir disto (hoje, amanhã, \"sexta que vem\", \"próximo fim de semana\", \"daqui a 3 dias\"). " +
    "Só peça a data exata se for realmente impossível inferir. Em dúvida sobre o dia atual, use a ferramenta current_datetime. " +
    "Passe datas para as ferramentas em ISO-8601."
  );
}
