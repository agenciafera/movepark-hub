// MCP server — registro de tools (definições puras + filtragem por escopo).
// Os handlers impuros (RPC/edge) ficam no index.ts, indexados por `name`.
// Lógica pura — testável com deno test. Ver docs/specs/mcp.md.

import { READ_TOOLS, toMcpToolDef } from "../_shared/assistant-tools.ts";
import { CUSTOMER_AUTH_TOOLS, CUSTOMER_TXN_TOOLS } from "./customer.logic.ts";

export type Endpoint = "public" | "partner" | "customer";

export interface ToolDef {
  name: string;
  description: string;
  // JSON Schema do input (object). Mantido simples e alinhado à API v1.
  inputSchema: Record<string, unknown>;
  // Só parceiro: escopo exigido (espelha api_scope). Público não tem.
  scope?: string;
}

function obj(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}
const S = { type: "string" };
const INT = { type: "integer" };
const DT = { type: "string", format: "date-time" };

// ── Consumidor (público/anon) — descoberta ───────────────────────────────────
// Registro canônico em _shared/assistant-tools.ts, compartilhado com a Edge `chat`.
// Não declare tool de leitura aqui: ela divergiria do assistente web (era o que
// acontecia antes, com current_datetime, category e colunas de destino).
export const PUBLIC_TOOLS: ToolDef[] = READ_TOOLS.map(toMcpToolDef);

// ── Parceiro (autenticado por chave + escopo) — sobre a API v1 ────────────────
export const PARTNER_TOOLS: ToolDef[] = [
  {
    name: "list_locations",
    description: "Lista as unidades da sua empresa.",
    scope: "locations:read",
    inputSchema: obj({ limit: INT, offset: INT }),
  },
  {
    name: "get_location",
    description: "Detalhe de uma unidade da sua empresa.",
    scope: "locations:read",
    inputSchema: obj({ location_id: S }, ["location_id"]),
  },
  {
    name: "list_parking_types",
    description: "Tipos de vaga de uma unidade da sua empresa.",
    scope: "parking-types:read",
    inputSchema: obj({ location_id: S }, ["location_id"]),
  },
  {
    name: "get_availability",
    description: "Disponibilidade de um tipo de vaga num período.",
    scope: "availability:read",
    inputSchema: obj(
      { location_parking_type_id: S, from: DT, to: DT },
      ["location_parking_type_id", "from", "to"],
    ),
  },
  {
    name: "simulate_price",
    description: "Simula o preço de uma reserva de um tipo de vaga da sua empresa.",
    scope: "pricing:read",
    inputSchema: obj(
      { location_parking_type_id: S, days: { ...INT, minimum: 1, default: 1 } },
      ["location_parking_type_id"],
    ),
  },
  {
    name: "list_bookings",
    description: "Lista reservas da sua empresa (filtros opcionais).",
    scope: "bookings:read",
    inputSchema: obj({ status: S, from: DT, to: DT, limit: INT, offset: INT }),
  },
  {
    name: "get_booking",
    description: "Detalhe de uma reserva da sua empresa.",
    scope: "bookings:read",
    inputSchema: obj({ booking_id: S }, ["booking_id"]),
  },
  {
    name: "create_booking",
    description: "Cria uma reserva atribuída à sua empresa (idempotente por idempotency_key).",
    scope: "bookings:write",
    inputSchema: obj(
      {
        location_parking_type_id: S,
        check_in_at: DT,
        check_out_at: DT,
        customer_name: S,
        customer_email: { ...S, format: "email" },
        customer_phone: S,
        add_on_service_ids: { type: "array", items: S },
        coupon_code: S,
        idempotency_key: S,
      },
      ["location_parking_type_id", "check_in_at", "check_out_at"],
    ),
  },
  {
    name: "cancel_booking",
    description: "Cancela uma reserva da sua empresa.",
    scope: "bookings:cancel",
    inputSchema: obj({ booking_id: S, reason: S }, ["booking_id"]),
  },
  {
    name: "check_in_booking",
    description: "Registra check-in (confirmed → checked_in).",
    scope: "bookings:checkin",
    inputSchema: obj({ booking_id: S }, ["booking_id"]),
  },
  {
    name: "check_out_booking",
    description: "Registra check-out (checked_in → completed).",
    scope: "bookings:checkin",
    inputSchema: obj({ booking_id: S }, ["booking_id"]),
  },
  {
    name: "change_booking_dates",
    description: "Reagenda uma reserva pendente: revalida capacidade e re-precifica.",
    scope: "bookings:write",
    inputSchema: obj({ booking_id: S, check_in_at: DT, check_out_at: DT }, [
      "booking_id",
      "check_in_at",
      "check_out_at",
    ]),
  },
  {
    name: "change_booking_vehicle",
    description:
      "Troca o veículo/placa de uma reserva (pendente ou confirmada). Informe vehicle_id (do titular) ou license_plate.",
    scope: "bookings:write",
    inputSchema: obj({ booking_id: S, vehicle_id: S, license_plate: S }, ["booking_id"]),
  },
  {
    name: "wps_event",
    description:
      "Evento de pátio (WPS): entrada/saída de veículo por placa (ANPR) ou booking_code → check-in/check-out. Idempotente por event_id.",
    scope: "wps:write",
    inputSchema: obj(
      {
        event_id: S,
        type: { type: "string", enum: ["vehicle.entered", "vehicle.exited"] },
        plate: S,
        booking_code: S,
        location_ref: S,
        occurred_at: DT,
      },
      ["event_id", "type"],
    ),
  },
  // Promoções — cupons
  { name: "list_coupons", description: "Lista os cupons da empresa.", scope: "coupons:read", inputSchema: obj({}) },
  {
    name: "upsert_coupon",
    description: "Cria/atualiza um cupom (id ausente = novo).",
    scope: "coupons:write",
    inputSchema: obj(
      {
        id: S, code: S, description: S, discount_type: { type: "string", enum: ["percent", "fixed"] },
        discount_value: { type: "number" }, valid_from: DT, valid_until: DT, max_uses: INT,
        is_active: { type: "boolean" }, per_user_limit: INT, min_amount: { type: "number" }, min_days: INT,
        parking_type_ids: { type: "array", items: S },
      },
      ["code", "discount_type", "discount_value"],
    ),
  },
  { name: "set_coupon_active", description: "Ativa/desativa um cupom.", scope: "coupons:write",
    inputSchema: obj({ id: S, is_active: { type: "boolean" } }, ["id", "is_active"]) },
  { name: "delete_coupon", description: "Exclui um cupom (bloqueado se já usado).", scope: "coupons:write",
    inputSchema: obj({ id: S }, ["id"]) },
  // Promoções — descontos
  { name: "list_discounts", description: "Lista os descontos automáticos da empresa.", scope: "discounts:read", inputSchema: obj({}) },
  {
    name: "upsert_discount",
    description: "Cria/atualiza um desconto automático (id ausente = novo).",
    scope: "discounts:write",
    inputSchema: obj(
      {
        id: S, location_id: S, name: S, description: S, discount_type: { type: "string", enum: ["percent", "fixed"] },
        discount_value: { type: "number" }, valid_from: DT, valid_until: DT, min_days: INT,
        min_amount: { type: "number" }, advance_days: INT, allow_coupon_stack: { type: "boolean" },
        priority: INT, is_active: { type: "boolean" }, parking_type_ids: { type: "array", items: S },
      },
      ["name", "discount_type", "discount_value"],
    ),
  },
  { name: "set_discount_active", description: "Ativa/desativa um desconto.", scope: "discounts:write",
    inputSchema: obj({ id: S, is_active: { type: "boolean" } }, ["id", "is_active"]) },
  { name: "delete_discount", description: "Exclui um desconto (bloqueado se já usado).", scope: "discounts:write",
    inputSchema: obj({ id: S }, ["id"]) },
  // Serviços adicionais
  { name: "list_addons", description: "Lista os serviços adicionais da empresa.", scope: "addons:read", inputSchema: obj({}) },
  {
    name: "upsert_addon",
    description: "Cria/atualiza um serviço adicional (id ausente = novo).",
    scope: "addons:write",
    inputSchema: obj(
      { id: S, code: S, name: S, description: S, base_price: { type: "number" }, is_active: { type: "boolean" } },
      ["name"],
    ),
  },
  {
    name: "set_location_addon",
    description: "Habilita/precifica um serviço adicional numa unidade.",
    scope: "addons:write",
    inputSchema: obj(
      { id: S, location_id: S, is_active: { type: "boolean" }, price_override: { type: "number" } },
      ["id", "location_id"],
    ),
  },
  { name: "delete_addon", description: "Exclui um serviço adicional (bloqueado se já usado).", scope: "addons:write",
    inputSchema: obj({ id: S }, ["id"]) },
  // Avaliações
  { name: "list_reviews", description: "Lista avaliações das unidades da empresa.", scope: "reviews:read",
    inputSchema: obj({ limit: INT }) },
  { name: "respond_review", description: "Responde publicamente a uma avaliação.", scope: "reviews:write",
    inputSchema: obj({ id: S, response: S }, ["id", "response"]) },
  // Ocupação
  { name: "get_occupancy", description: "Ocupação por data de uma unidade (booked/capacity).", scope: "occupancy:read",
    inputSchema: obj({ location_id: S, from: { type: "string", format: "date" }, to: { type: "string", format: "date" } },
      ["location_id", "from", "to"]) },
  // Escritas
  {
    name: "update_location",
    description: "Edita dados de uma unidade (campos ausentes = mantém).",
    scope: "locations:write",
    inputSchema: obj({ location_id: S, name: S, address: S, phone: S, email: S, reservation_policy: S, has_notice: { type: "boolean" }, notice: S }, ["location_id"]),
  },
  {
    name: "update_parking_type",
    description: "Edita um tipo de vaga: status, capacidade e regras (campos ausentes = mantém).",
    scope: "parking-types:write",
    inputSchema: obj(
      {
        location_parking_type_id: S, is_active: { type: "boolean" }, capacity: INT,
        near_capacity_threshold: INT, near_capacity_message: S, has_minimum_stay: { type: "boolean" },
        minimum_stay_value: INT, minimum_stay_unit: S, has_minimum_date: { type: "boolean" }, minimum_date: { type: "string", format: "date" },
      },
      ["location_parking_type_id"],
    ),
  },
  // Precificação (E1.4.1) e bloqueio de datas (E1.4.2)
  {
    name: "update_pricing_rule",
    description: "Edita a regra de preço de um tipo de vaga: base_price, estratégia e faixas (tiers).",
    scope: "pricing:write",
    inputSchema: obj(
      {
        location_parking_type_id: S,
        base_price: { type: "number" },
        rule: { type: "object", description: "Regra (strategy, fractional_day_policy, old_price_*, tiers incrementais/mensal/horário)" },
        tiers: { type: "array", items: { type: "object" }, description: "Faixas por diárias: { from_day, to_day, unit_price, total_price }" },
      },
      ["location_parking_type_id"],
    ),
  },
  {
    name: "set_date_blocked",
    description: "Bloqueia/desbloqueia uma data específica de um tipo de vaga (manutenção, lotado).",
    scope: "pricing:write",
    inputSchema: obj(
      { location_parking_type_id: S, date: { type: "string", format: "date" }, blocked: { type: "boolean" } },
      ["location_parking_type_id", "date", "blocked"],
    ),
  },
];

// Consumidor autenticado (usuário final logado por OTP): descoberta (READ_TOOLS) + login +
// transacionais (reservar em nome do usuário). Sem `scope` (o gate é o JWT + RLS do dono).
export const CUSTOMER_TOOLS: ToolDef[] = [
  ...READ_TOOLS.map(toMcpToolDef),
  ...CUSTOMER_AUTH_TOOLS,
  ...CUSTOMER_TXN_TOOLS,
];

const REGISTRY: Record<Endpoint, ToolDef[]> = {
  public: PUBLIC_TOOLS,
  partner: PARTNER_TOOLS,
  customer: CUSTOMER_TOOLS,
};

function registry(endpoint: Endpoint): ToolDef[] {
  return REGISTRY[endpoint];
}

// `tools/list`: público devolve tudo; parceiro filtra pelos escopos da chave.
// Devolve o shape MCP (name/description/inputSchema) — sem `scope`/handler.
export function listTools(
  endpoint: Endpoint,
  scopes: string[] = [],
): Array<Pick<ToolDef, "name" | "description" | "inputSchema">> {
  // Só o parceiro filtra por escopo; público e consumidor mostram tudo (tools sem `scope`).
  return registry(endpoint)
    .filter((t) => endpoint !== "partner" || !t.scope || scopes.includes(t.scope))
    .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export function findTool(endpoint: Endpoint, name: string): ToolDef | null {
  return registry(endpoint).find((t) => t.name === name) ?? null;
}

// Gate de segurança do `tools/call`: uma tool só é chamável se existe E (é pública, ou não exige
// escopo, ou a chave tem o escopo). Espelha o filtro de `listTools` — garante que uma tool
// escondida na listagem também NÃO seja executável (senão dava pra chamar tool fora de escopo
// sabendo o nome). Fora de escopo é tratado como inexistente (não revela a existência da tool).
export function isToolCallable(endpoint: Endpoint, name: string, scopes: string[] = []): boolean {
  const tool = findTool(endpoint, name);
  if (!tool) return false;
  if (endpoint !== "partner") return true;
  return !tool.scope || scopes.includes(tool.scope);
}

// Valida os campos `required` do inputSchema (checagem leve, sem libs externas).
export function missingRequired(tool: ToolDef, args: Record<string, unknown>): string | null {
  const required = (tool.inputSchema.required as string[] | undefined) ?? [];
  for (const k of required) {
    const v = args[k];
    if (v === undefined || v === null || v === "") return k;
  }
  return null;
}
