// Lógica pura do agente de chat (Gemini function-calling), testável sem rede (E3.3).
// As funções aqui NÃO fazem fetch — só definem as tools, formatam o histórico no shape do
// Gemini, roteiam nomes de tool e controlam o loop. A chamada à Gemini e o dispatch impuro
// (RPCs/Edges) ficam no index.ts. Ver docs/specs/chatbot.md.

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
  {
    name: "search_parking",
    description:
      "Busca estacionamentos por destino (código de aeroporto como GRU/CGH ou cidade) e período. Use antes de simular preço ou reservar.",
    parameters: obj(
      {
        dest: STR("Código do aeroporto (ex.: GRU) ou nome da cidade"),
        from: STR("Check-in em ISO-8601 (ex.: 2026-07-10T10:00:00Z)"),
        to: STR("Check-out em ISO-8601"),
        vehicle: STR("car ou motorcycle"),
        max_distance_km: NUM("Raio máximo em km"),
        limit: NUM("Máximo de resultados (default 20)"),
      },
      ["dest", "from", "to"],
    ),
  },
  {
    name: "simulate_price",
    description: "Simula o preço de uma reserva por empresa (slug), unidade, tipo de vaga e nº de diárias.",
    parameters: obj(
      {
        company: STR("slug da empresa (ex.: virapark)"),
        location: STR("slug da unidade (opcional)"),
        parking_type: STR("code do tipo de vaga, ex.: covered (opcional)"),
        days: NUM("Número de diárias (default 1)"),
      },
      ["company"],
    ),
  },
  {
    name: "get_faq",
    description: "Perguntas frequentes (global ou de uma unidade específica).",
    parameters: obj({ location_id: STR("id da unidade (opcional)"), query: STR("texto da busca (opcional)"), limit: NUM("máximo") }),
  },
  { name: "list_companies", description: "Lista as operadoras parceiras (empresas) ativas.", parameters: obj({ limit: NUM("máximo") }) },
  { name: "list_locations", description: "Lista unidades (estacionamentos) ativas.", parameters: obj({ limit: NUM("máximo") }) },
  {
    name: "get_parking_types",
    description: "Tipos de vaga de uma unidade (coberto, descoberto, valet). Devolve os ids usados para reservar.",
    parameters: obj({ location_id: STR("id da unidade") }, ["location_id"]),
  },
  { name: "list_destinations", description: "Lista destinos (aeroportos/cidades) atendidos, com slug.", parameters: obj({ limit: NUM("máximo") }) },
  { name: "get_destination", description: "Detalhe de um destino pelo slug, com terminais.", parameters: obj({ slug: STR("slug do destino") }, ["slug"]) },
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
];

export const TRANSACTIONAL = new Set(TOOLS.filter((t) => t.transactional).map((t) => t.name));

/** Bloco `tools` do request Gemini (functionDeclarations). */
export function geminiTools() {
  return [{ functionDeclarations: TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters })) }];
}

/** Limite de rodadas de tool-call (anti-loop). */
export const MAX_TOOL_ROUNDS = 6;
export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_SYSTEM_PROMPT =
  "Você é o assistente virtual da Movepark — um marketplace de estacionamentos perto de aeroportos. " +
  "Responda em português do Brasil, de forma curta e cordial. Escreva sempre a marca como \"Movepark\". " +
  "NUNCA invente preço, disponibilidade, unidades ou destinos: use as ferramentas (search_parking, " +
  "simulate_price, get_faq, etc.) para qualquer dado concreto. Para reservar ou cancelar, use as ferramentas " +
  "transacionais — se o usuário não estiver logado, peça que ele faça login em /entrar antes. Confirme os " +
  "detalhes (unidade, datas, valor) com o usuário antes de criar ou cancelar uma reserva.";

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
