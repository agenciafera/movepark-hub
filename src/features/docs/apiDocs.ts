// Conteúdo da documentação pública da API/MCP (página /docs).
// Fonte curada — mantenha em sincronia com o gateway + OpenAPI ao mudar a superfície
// (ADR-003, doc-as-you-build). Ver docs/specs/public-api.md e docs/specs/mcp.md.

export const API_BASE = "https://api.movepark.co";
export const MCP_BASE = "https://mcp.movepark.co";

export type HttpMethod = "GET" | "POST";

export type Param = { name: string; in: "path" | "query" | "header"; required?: boolean; desc: string };

export type Endpoint = {
  method: HttpMethod;
  path: string;
  summary: string;
  scope?: string;
  params?: Param[];
  body?: string; // exemplo de request body (JSON)
  response?: string; // exemplo de response (JSON)
  notes?: string;
};

export type Group = { id: string; title: string; description?: string; endpoints: Endpoint[] };

export const SCOPES: { scope: string; description: string }[] = [
  { scope: "locations:read", description: "Listar e ler unidades da empresa" },
  { scope: "locations:write", description: "Editar dados de unidade" },
  { scope: "parking-types:read", description: "Listar tipos de vaga e preços" },
  { scope: "parking-types:write", description: "Editar status/capacidade/regras de tipo de vaga" },
  { scope: "availability:read", description: "Consultar disponibilidade por período" },
  { scope: "pricing:read", description: "Simular preço de uma reserva" },
  { scope: "bookings:read", description: "Listar e ler reservas da empresa" },
  { scope: "bookings:write", description: "Criar reserva via API" },
  { scope: "bookings:cancel", description: "Cancelar reserva" },
  { scope: "bookings:checkin", description: "Registrar check-in / check-out" },
  { scope: "coupons:read", description: "Ler cupons" },
  { scope: "coupons:write", description: "Gerir cupons" },
  { scope: "discounts:read", description: "Ler descontos automáticos" },
  { scope: "discounts:write", description: "Gerir descontos automáticos" },
  { scope: "addons:read", description: "Ler serviços adicionais" },
  { scope: "addons:write", description: "Gerir serviços adicionais" },
  { scope: "reviews:read", description: "Ler avaliações" },
  { scope: "reviews:write", description: "Responder avaliações" },
  { scope: "occupancy:read", description: "Consultar ocupação por data" },
  { scope: "faq:read", description: "Ler FAQ" },
  { scope: "webhooks:write", description: "Webhooks de integração (em breve)" },
];

export const STATUS_CODES: { code: string; name: string; when: string }[] = [
  { code: "200", name: "OK", when: "Requisição bem-sucedida (leitura ou ação)." },
  { code: "201", name: "Created", when: "Recurso criado (ex.: reserva, cupom)." },
  { code: "401", name: "Unauthorized", when: "Chave ausente, inválida, revogada ou expirada." },
  { code: "403", name: "Forbidden", when: "A chave não tem o escopo exigido pelo endpoint." },
  { code: "404", name: "Not Found", when: "Recurso não encontrado nesta empresa." },
  { code: "409", name: "Conflict", when: "Conflito (ex.: sem disponibilidade na data)." },
  { code: "422", name: "Unprocessable", when: "Erro de validação dos parâmetros enviados." },
  { code: "429", name: "Too Many Requests", when: "Limite de requisições por minuto excedido." },
  { code: "5xx", name: "Server Error", when: "Erro interno. Tente novamente; reporte o request_id." },
];

const RES_LOCATIONS = `{
  "data": [
    {
      "id": "a8764272-…",
      "slug": "aeroporto-congonhas",
      "name": "Aeroporto de Congonhas",
      "address": "Av. Washington Luís, 7059 - São Paulo - SP",
      "latitude": -23.6286, "longitude": -46.6569,
      "timezone": "America/Sao_Paulo", "status": "active",
      "phone": null, "email": null
    }
  ],
  "meta": { "request_id": "req_8f2c…" }
}`;

const RES_BOOKING = `{
  "data": {
    "code": "MP-7K2D9X",
    "booking_id": "b1f0…",
    "total_amount": 119.40,
    "subtotal": 119.40,
    "days": 3,
    "expires_at": "2026-06-16T12:30:00Z",
    "line_items": [
      { "kind": "parking", "name": "covered", "quantity": 1, "unit_price": 119.40, "subtotal": 119.40 }
    ]
  },
  "meta": { "request_id": "req_a1b2…" }
}`;

export const REST_GROUPS: Group[] = [
  {
    id: "locations",
    title: "Unidades",
    description: "Estacionamentos (unidades) da sua empresa.",
    endpoints: [
      {
        method: "GET", path: "/v1/locations", scope: "locations:read",
        summary: "Lista as unidades da empresa.",
        params: [
          { name: "limit", in: "query", desc: "Itens por página (padrão 20, máx 100)." },
          { name: "offset", in: "query", desc: "Deslocamento para paginação." },
        ],
        response: RES_LOCATIONS,
      },
      {
        method: "GET", path: "/v1/locations/{id}", scope: "locations:read",
        summary: "Detalhe de uma unidade.",
        params: [{ name: "id", in: "path", required: true, desc: "ID da unidade." }],
        response: `{ "data": { "id": "a8764272-…", "slug": "aeroporto-congonhas", "name": "…", "photos": [] }, "meta": { "request_id": "req_…" } }`,
      },
      {
        method: "GET", path: "/v1/locations/{id}/parking-types", scope: "parking-types:read",
        summary: "Tipos de vaga de uma unidade.",
        params: [{ name: "id", in: "path", required: true, desc: "ID da unidade." }],
        response: `{
  "data": [
    { "id": "lpt_…", "code": "covered", "name": "Coberto", "capacity": 120, "is_active": true }
  ],
  "meta": { "request_id": "req_…" }
}`,
      },
      {
        method: "POST", path: "/v1/locations/{id}", scope: "locations:write",
        summary: "Edita dados de uma unidade (campos ausentes = mantém).",
        params: [{ name: "id", in: "path", required: true, desc: "ID da unidade." }],
        body: `{
  "phone": "+551150000000",
  "email": "contato@unidade.com",
  "reservation_policy": "Chegue 30min antes do voo."
}`,
        response: `{ "data": { "id": "a8764272-…", "phone": "+551150000000", "email": "contato@unidade.com" }, "meta": { "request_id": "req_…" } }`,
      },
    ],
  },
  {
    id: "availability",
    title: "Disponibilidade & Preço",
    endpoints: [
      {
        method: "GET", path: "/v1/availability", scope: "availability:read",
        summary: "Disponibilidade de um tipo de vaga num período.",
        params: [
          { name: "location_parking_type_id", in: "query", required: true, desc: "ID do tipo de vaga." },
          { name: "from", in: "query", required: true, desc: "Check-in (ISO-8601)." },
          { name: "to", in: "query", required: true, desc: "Check-out (ISO-8601)." },
        ],
        response: `{ "data": { "location_parking_type_id": "lpt_…", "capacity": 120, "remaining": 84, "sold_out": false, "near_capacity": false }, "meta": { "request_id": "req_…" } }`,
      },
      {
        method: "POST", path: "/v1/pricing/simulate", scope: "pricing:read",
        summary: "Simula o preço de uma reserva.",
        body: `{ "location_parking_type_id": "lpt_…", "days": 3 }`,
        response: `{ "data": { "price": 119.40, "base_price": 119.40, "old_price": null, "days": 3, "currency": "BRL", "strategy": "tiered_progressive" }, "meta": { "request_id": "req_…" } }`,
      },
    ],
  },
  {
    id: "bookings",
    title: "Reservas",
    description: "Reservas criadas em nome da empresa. Idempotência via header Idempotency-Key.",
    endpoints: [
      {
        method: "GET", path: "/v1/bookings", scope: "bookings:read",
        summary: "Lista reservas da empresa.",
        params: [
          { name: "status", in: "query", desc: "Filtra por status (pending, confirmed, …)." },
          { name: "from", in: "query", desc: "Check-in a partir de (ISO-8601)." },
          { name: "to", in: "query", desc: "Check-in até (ISO-8601)." },
          { name: "limit", in: "query", desc: "Itens por página." },
        ],
        response: `{ "data": [ { "id": "b1f0…", "code": "MP-7K2D9X", "status": "pending", "total_amount": 119.40, "customer_email": "cli@ex.com", "created_via_api": true } ], "meta": { "request_id": "req_…" } }`,
      },
      {
        method: "GET", path: "/v1/bookings/{id}", scope: "bookings:read",
        summary: "Detalhe de uma reserva.",
        params: [{ name: "id", in: "path", required: true, desc: "ID da reserva." }],
        response: `{ "data": { "id": "b1f0…", "code": "MP-7K2D9X", "status": "pending", "items": [ … ] }, "meta": { "request_id": "req_…" } }`,
      },
      {
        method: "POST", path: "/v1/bookings", scope: "bookings:write",
        summary: "Cria uma reserva atribuída à empresa.",
        params: [{ name: "Idempotency-Key", in: "header", desc: "Evita reserva duplicada em retry." }],
        body: `{
  "location_parking_type_id": "lpt_…",
  "check_in_at": "2026-07-10T22:00:00Z",
  "check_out_at": "2026-07-13T08:00:00Z",
  "customer_name": "Maria Silva",
  "customer_email": "maria@ex.com",
  "customer_phone": "+5511999990000",
  "add_on_service_ids": [],
  "coupon_code": "PROMO10"
}`,
        response: RES_BOOKING,
      },
      {
        method: "POST", path: "/v1/bookings/{id}/cancel", scope: "bookings:cancel",
        summary: "Cancela uma reserva.",
        params: [{ name: "id", in: "path", required: true, desc: "ID da reserva." }],
        body: `{ "reason": "Cliente desistiu" }`,
        response: `{ "data": { "booking_id": "b1f0…", "status": "cancelled" }, "meta": { "request_id": "req_…" } }`,
      },
      {
        method: "POST", path: "/v1/bookings/{id}/check-in", scope: "bookings:checkin",
        summary: "Registra check-in (confirmed → checked_in).",
        params: [{ name: "id", in: "path", required: true, desc: "ID da reserva." }],
        response: `{ "data": { "booking_id": "b1f0…", "status": "checked_in" }, "meta": { "request_id": "req_…" } }`,
      },
      {
        method: "POST", path: "/v1/bookings/{id}/check-out", scope: "bookings:checkin",
        summary: "Registra check-out (checked_in → completed).",
        params: [{ name: "id", in: "path", required: true, desc: "ID da reserva." }],
        response: `{ "data": { "booking_id": "b1f0…", "status": "completed" }, "meta": { "request_id": "req_…" } }`,
      },
    ],
  },
  {
    id: "parking-types",
    title: "Tipos de vaga (escrita)",
    endpoints: [
      {
        method: "POST", path: "/v1/parking-types/{id}", scope: "parking-types:write",
        summary: "Edita status, capacidade e regras de um tipo de vaga (campos ausentes = mantém).",
        params: [{ name: "id", in: "path", required: true, desc: "ID do tipo de vaga (location_parking_type)." }],
        body: `{
  "is_active": true,
  "capacity": 150,
  "near_capacity_threshold": 10,
  "near_capacity_message": "Últimas vagas!",
  "has_minimum_stay": true,
  "minimum_stay_value": 2,
  "minimum_stay_unit": "days"
}`,
        response: `{ "data": { "id": "lpt_…", "is_active": true, "capacity": 150 }, "meta": { "request_id": "req_…" } }`,
      },
    ],
  },
  {
    id: "coupons",
    title: "Cupons",
    endpoints: [
      { method: "GET", path: "/v1/coupons", scope: "coupons:read", summary: "Lista os cupons da empresa.",
        response: `{ "data": [ { "id": "cpn_…", "code": "PROMO10", "discount_type": "percent", "discount_value": 10, "is_active": true, "times_used": 4 } ], "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/coupons", scope: "coupons:write", summary: "Cria/atualiza um cupom (id no corpo = edição).",
        body: `{ "code": "PROMO10", "discount_type": "percent", "discount_value": 10, "max_uses": 100, "is_active": true }`,
        response: `{ "data": "cpn_…", "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/coupons/{id}/active", scope: "coupons:write", summary: "Ativa/desativa um cupom.",
        params: [{ name: "id", in: "path", required: true, desc: "ID do cupom." }],
        body: `{ "is_active": false }`, response: `{ "data": null, "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/coupons/{id}/delete", scope: "coupons:write", summary: "Exclui um cupom (bloqueado se já usado).",
        params: [{ name: "id", in: "path", required: true, desc: "ID do cupom." }],
        response: `{ "data": null, "meta": { "request_id": "req_…" } }` },
    ],
  },
  {
    id: "discounts",
    title: "Descontos automáticos",
    endpoints: [
      { method: "GET", path: "/v1/discounts", scope: "discounts:read", summary: "Lista os descontos automáticos.",
        response: `{ "data": [ { "id": "dsc_…", "name": "Antecipada", "discount_type": "percent", "discount_value": 15, "is_active": true } ], "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/discounts", scope: "discounts:write", summary: "Cria/atualiza um desconto automático.",
        body: `{ "name": "Antecipada", "discount_type": "percent", "discount_value": 15, "advance_days": 7, "allow_coupon_stack": false }`,
        response: `{ "data": "dsc_…", "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/discounts/{id}/active", scope: "discounts:write", summary: "Ativa/desativa um desconto.",
        params: [{ name: "id", in: "path", required: true, desc: "ID do desconto." }], body: `{ "is_active": false }`,
        response: `{ "data": null, "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/discounts/{id}/delete", scope: "discounts:write", summary: "Exclui um desconto (bloqueado se já usado).",
        params: [{ name: "id", in: "path", required: true, desc: "ID do desconto." }],
        response: `{ "data": null, "meta": { "request_id": "req_…" } }` },
    ],
  },
  {
    id: "addons",
    title: "Serviços adicionais",
    endpoints: [
      { method: "GET", path: "/v1/addons", scope: "addons:read", summary: "Lista os serviços adicionais.",
        response: `{ "data": [ { "id": "svc_…", "code": "lava-jato", "name": "Lava-jato", "base_price": 50, "is_active": true, "locations": [] } ], "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/addons", scope: "addons:write", summary: "Cria/atualiza um serviço adicional.",
        body: `{ "name": "Lava-jato", "base_price": 50, "is_active": true }`, response: `{ "data": "svc_…", "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/addons/{id}/locations", scope: "addons:write", summary: "Habilita/precifica um serviço numa unidade.",
        params: [{ name: "id", in: "path", required: true, desc: "ID do serviço." }],
        body: `{ "location_id": "a8764272-…", "is_active": true, "price_override": 45 }`,
        response: `{ "data": null, "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/addons/{id}/delete", scope: "addons:write", summary: "Exclui um serviço (bloqueado se já usado).",
        params: [{ name: "id", in: "path", required: true, desc: "ID do serviço." }],
        response: `{ "data": null, "meta": { "request_id": "req_…" } }` },
    ],
  },
  {
    id: "reviews",
    title: "Avaliações",
    endpoints: [
      { method: "GET", path: "/v1/reviews", scope: "reviews:read", summary: "Lista avaliações das unidades da empresa.",
        params: [{ name: "limit", in: "query", desc: "Itens (padrão 50, máx 500)." }],
        response: `{ "data": [ { "id": "rev_…", "rating": 5, "comment": "Ótimo!", "owner_response": null, "created_at": "2026-06-01T…" } ], "meta": { "request_id": "req_…" } }` },
      { method: "POST", path: "/v1/reviews/{id}/respond", scope: "reviews:write", summary: "Responde publicamente a uma avaliação.",
        params: [{ name: "id", in: "path", required: true, desc: "ID da avaliação." }],
        body: `{ "response": "Obrigado pela visita!" }`, response: `{ "data": null, "meta": { "request_id": "req_…" } }` },
    ],
  },
  {
    id: "occupancy",
    title: "Ocupação",
    endpoints: [
      { method: "GET", path: "/v1/occupancy", scope: "occupancy:read", summary: "Ocupação por data de uma unidade (booked/capacity).",
        params: [
          { name: "location_id", in: "query", required: true, desc: "ID da unidade." },
          { name: "from", in: "query", required: true, desc: "Data inicial (YYYY-MM-DD)." },
          { name: "to", in: "query", required: true, desc: "Data final (YYYY-MM-DD)." },
        ],
        response: `{ "data": [ { "location_parking_type_id": "lpt_…", "parking_type": "Coberto", "date": "2027-01-01", "capacity": 120, "booked_count": 36 } ], "meta": { "request_id": "req_…" } }` },
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    endpoints: [
      { method: "GET", path: "/v1/faq", scope: "faq:read", summary: "Perguntas frequentes (global ou por unidade).",
        params: [
          { name: "location_id", in: "query", desc: "ID da unidade (opcional)." },
          { name: "query", in: "query", desc: "Busca textual (opcional)." },
        ],
        response: `{ "data": { "items": [ { "question": "Como cancelo?", "answer": "…", "scope": "global" } ] }, "meta": { "request_id": "req_…" } }` },
    ],
  },
];

// ── MCP ──────────────────────────────────────────────────────────────────────
export const MCP_PUBLIC_TOOLS = [
  "search_parking", "simulate_price", "get_faq", "list_companies", "list_locations",
  "get_parking_types", "list_destinations", "get_destination",
];

export const MCP_PARTNER_TOOLS: { name: string; scope: string }[] = [
  { name: "list_locations / get_location", scope: "locations:read" },
  { name: "list_parking_types", scope: "parking-types:read" },
  { name: "get_availability", scope: "availability:read" },
  { name: "simulate_price", scope: "pricing:read" },
  { name: "list_bookings / get_booking", scope: "bookings:read" },
  { name: "create_booking", scope: "bookings:write" },
  { name: "cancel_booking", scope: "bookings:cancel" },
  { name: "check_in_booking / check_out_booking", scope: "bookings:checkin" },
  { name: "list_coupons / upsert_coupon / set_coupon_active / delete_coupon", scope: "coupons:*" },
  { name: "list_discounts / upsert_discount / set_discount_active / delete_discount", scope: "discounts:*" },
  { name: "list_addons / upsert_addon / set_location_addon / delete_addon", scope: "addons:*" },
  { name: "list_reviews / respond_review", scope: "reviews:*" },
  { name: "get_occupancy", scope: "occupancy:read" },
  { name: "update_location", scope: "locations:write" },
  { name: "update_parking_type", scope: "parking-types:write" },
];

export const MCP_EXAMPLE_LIST = `POST ${MCP_BASE}
content-type: application/json

{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }`;

export const MCP_EXAMPLE_CALL = `POST ${MCP_BASE}/partner
content-type: application/json
authorization: Bearer mp_live_…

{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "list_bookings", "arguments": { "limit": 10 } }
}`;
