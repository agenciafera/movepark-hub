// Superfície /customer do MCP — lógica pura das tools de autenticação (E0.7 / agent-booking).
// Login passwordless em nome do usuário final: o agente dispara o OTP e troca o código por uma
// sessão. Aqui só o mapeamento canal→parâmetros do GoTrue e as definições das tools; a chamada de
// rede (supabase.auth.*) fica no index.ts. Testável com deno test. Ver docs/specs/customer/agent-booking.md.

import type { ToolDef } from "./tools.ts";

export type OtpChannel = "whatsapp" | "email";
const CHANNELS: OtpChannel[] = ["whatsapp", "email"];

export function isOtpChannel(v: unknown): v is OtpChannel {
  return typeof v === "string" && (CHANNELS as string[]).includes(v);
}

/** Parâmetros de `supabase.auth.signInWithOtp` por canal. Lança em canal/identificador inválido. */
export function otpRequestParams(channel: unknown, identifier: unknown): Record<string, unknown> {
  if (!isOtpChannel(channel)) {
    throw new Error("Canal inválido. Use 'whatsapp' ou 'email'.");
  }
  const id = typeof identifier === "string" ? identifier.trim() : "";
  if (!id) throw new Error("Identificador (telefone ou e-mail) obrigatório.");

  if (channel === "whatsapp") {
    return { phone: id, options: { shouldCreateUser: true, channel: "whatsapp" } };
  }
  return { email: id, options: { shouldCreateUser: true } };
}

/** Parâmetros de `supabase.auth.verifyOtp` por canal. Lança em canal/código inválido. */
export function otpVerifyParams(
  channel: unknown,
  identifier: unknown,
  code: unknown,
): Record<string, unknown> {
  if (!isOtpChannel(channel)) {
    throw new Error("Canal inválido. Use 'whatsapp' ou 'email'.");
  }
  const id = typeof identifier === "string" ? identifier.trim() : "";
  const token = typeof code === "string" ? code.trim() : "";
  if (!id) throw new Error("Identificador (telefone ou e-mail) obrigatório.");
  if (!token) throw new Error("Código de verificação obrigatório.");

  // WhatsApp OTP verifica com type "sms" (o canal é escolhido no envio, não na verificação).
  if (channel === "whatsapp") return { phone: id, token, type: "sms" };
  return { email: id, token, type: "email" };
}

/**
 * Telefone afirmado pelo chamador confiável, no formato do `auth.users`: só dígitos, sem `+`.
 *
 * Aceita `+5541988149449` e `5541988149449`. Número do Brasil exige DDD e o nono dígito
 * (13 dígitos, `55 DD 9XXXXXXXX`): sem ele o GoTrue trataria como outro telefone e criaria uma
 * conta duplicada para a mesma pessoa. Fora do Brasil vale E.164 genérico (8 a 15 dígitos).
 * Lança em formato inválido.
 */
export function normalizeAssertedPhone(v: unknown): string {
  const bruto = typeof v === "string" ? v.trim() : "";
  if (!/^\+?[\d\s().-]+$/.test(bruto)) throw new Error("Telefone inválido. Use E.164, ex.: 5541988149449.");
  const d = bruto.replace(/\D/g, "");
  if (d.startsWith("55")) {
    if (!/^55[1-9]\d9\d{8}$/.test(d)) {
      throw new Error("Telefone do Brasil precisa de DDD e do nono dígito, ex.: 5541988149449.");
    }
    return d;
  }
  if (!/^[1-9]\d{7,14}$/.test(d)) throw new Error("Telefone inválido. Use E.164, ex.: 5541988149449.");
  return d;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});
const CHANNEL_PROP = { type: "string", enum: CHANNELS, description: "whatsapp ou email" };

// Tools de autenticação da superfície /customer. Sem `scope` (o modelo de escopo é só do parceiro).
export const CUSTOMER_AUTH_TOOLS: ToolDef[] = [
  {
    name: "request_login_otp",
    description:
      "Dispara um código de acesso (OTP) por WhatsApp ou e-mail para o usuário entrar. Passo 1 do login.",
    inputSchema: obj(
      {
        identifier: { type: "string", description: "Telefone em E.164 (WhatsApp) ou e-mail" },
        channel: CHANNEL_PROP,
      },
      ["identifier", "channel"],
    ),
  },
  {
    name: "verify_login_otp",
    description:
      "Troca o código recebido por uma sessão. Devolve access_token e refresh_token para o agente agir em nome do usuário. Passo 2 do login.",
    inputSchema: obj(
      {
        identifier: { type: "string", description: "O mesmo identificador do passo 1" },
        channel: CHANNEL_PROP,
        code: { type: "string", description: "Código de 6 dígitos recebido" },
      },
      ["identifier", "channel", "code"],
    ),
  },
  {
    name: "whoami",
    description:
      "Diz se há usuário autenticado no token atual e devolve id/e-mail/telefone. Não exige argumentos.",
    inputSchema: obj({}),
  },
  {
    // Chamador confiável: exige chave mp_ com `identity:assert` (header X-API-Key). Cria sessão
    // sem OTP, então é privilégio do bot da Movepark, que recebe o telefone já verificado pela
    // Meta. Sem a chave a tool nem aparece no tools/list. Ver agent-booking.md §4.
    name: "assert_verified_identity",
    scope: "identity:assert",
    description:
      "Entra como o dono de um telefone que o canal (WhatsApp) já verificou, sem código. Cria a conta se o telefone ainda não tiver uma. Devolve access_token e refresh_token, como verify_login_otp. Exige chave de agente confiável.",
    inputSchema: obj(
      { phone: { type: "string", description: "Telefone verificado pelo canal, E.164 com ou sem +, ex.: 5541988149449" } },
      ["phone"],
    ),
  },
];

// Monta o corpo do POST /create-booking a partir dos argumentos da tool. Puro (testável).
// Não manda idempotency_key: a dedup do consumidor é DERIVADA no servidor em create_booking_atomic
// (profile + vaga + datas), porque um modelo não inventa chave estável entre duas mensagens.
// origin: "mcp" marca a procedência da reserva feita pelo agente.
export function buildCreateBookingBody(a: Record<string, unknown>): Record<string, unknown> {
  return {
    location_parking_type_id: a.location_parking_type_id,
    check_in_at: a.check_in_at,
    check_out_at: a.check_out_at,
    fare_tier: a.fare_tier ?? null,
    add_on_service_ids: a.add_on_service_ids ?? null,
    coupon_code: a.coupon_code ?? null,
    passenger_count: a.passenger_count ?? null,
    has_pcd: a.has_pcd ?? false,
    origin: "mcp",
  };
}

// Tools transacionais da superfície /customer (exigem Authorization: Bearer <access_token>).
// Reservar em nome do usuário logado; sem `scope` (o gate é o JWT + RLS do dono). O pagamento fica
// fora do MCP: o agente monta a reserva e o handoff (F3) leva ao checkout. accept_terms e lookup_plate
// entram em F3 (aceite tem ressalva jurídica; consulta de placa é API externa paga).
export const CUSTOMER_TXN_TOOLS: ToolDef[] = [
  {
    name: "create_booking",
    description:
      "Cria uma reserva pendente para o usuário logado e segura a vaga. Use os ids vindos de get_parking_types. Confirme os dados com o usuário antes de reservar.",
    inputSchema: obj(
      {
        location_parking_type_id: { type: "string", description: "id do tipo de vaga (location_parking_type)" },
        check_in_at: { type: "string", format: "date-time", description: "Check-in ISO-8601" },
        check_out_at: { type: "string", format: "date-time", description: "Check-out ISO-8601" },
        fare_tier: { type: "string", enum: ["basica", "flex", "superflex"], description: "Tarifa (default basica)" },
        add_on_service_ids: { type: "array", items: { type: "string" }, description: "Serviços adicionais (opcional)" },
        coupon_code: { type: "string", description: "Cupom (opcional)" },
        passenger_count: { type: "integer", description: "Nº de passageiros (opcional)" },
        has_pcd: { type: "boolean", description: "Vaga PCD (opcional)" },
      },
      ["location_parking_type_id", "check_in_at", "check_out_at"],
    ),
  },
  {
    name: "set_booking_customer",
    description:
      "Preenche os dados do pagador na reserva (CPF/CNPJ e telefone são exigidos no pagamento). Campos ausentes ficam como estão.",
    inputSchema: obj(
      {
        booking_code: { type: "string", description: "Código da reserva (MP-...)" },
        tax_id: { type: "string", description: "CPF ou CNPJ do pagador" },
        phone: { type: "string", description: "Telefone com DDD (E.164)" },
        email: { type: "string", description: "E-mail do pagador" },
        first_name: { type: "string", description: "Nome" },
        last_name: { type: "string", description: "Sobrenome" },
      },
      ["booking_code"],
    ),
  },
  {
    name: "add_vehicle",
    description:
      "Cadastra um veículo do usuário pela placa. Devolve o vehicle_id para vincular à reserva.",
    inputSchema: obj(
      {
        license_plate: { type: "string", description: "Placa" },
        model: { type: "string", description: "Modelo (opcional)" },
        color: { type: "string", description: "Cor (opcional)" },
        set_default: { type: "boolean", description: "Tornar o veículo padrão (opcional)" },
      },
      ["license_plate"],
    ),
  },
  {
    name: "set_booking_vehicle",
    description: "Vincula um veículo já cadastrado (vehicle_id) à reserva.",
    inputSchema: obj(
      {
        booking_code: { type: "string", description: "Código da reserva (MP-...)" },
        vehicle_id: { type: "string", description: "id do veículo (de add_vehicle ou list)" },
      },
      ["booking_code", "vehicle_id"],
    ),
  },
  {
    name: "list_my_bookings",
    description: "Lista as reservas do usuário logado.",
    inputSchema: obj({ limit: { type: "integer", description: "máximo (default 10)" } }),
  },
  {
    name: "get_booking",
    description: "Detalhe de uma reserva do usuário pelo código.",
    inputSchema: obj({ booking_code: { type: "string", description: "Código (MP-...)" } }, ["booking_code"]),
  },
  {
    name: "get_booking_status",
    description:
      "Estado da reserva e do pagamento (para acompanhar a confirmação sem consultar tabelas). Devolve status, pagamento e expiração.",
    inputSchema: obj({ booking_code: { type: "string", description: "Código (MP-...)" } }, ["booking_code"]),
  },
  {
    name: "cancel_booking",
    description: "Cancela uma reserva do usuário. Confirme com o usuário antes de cancelar.",
    inputSchema: obj(
      {
        booking_code: { type: "string", description: "Código (MP-...)" },
        reason: { type: "string", description: "Motivo (opcional)" },
      },
      ["booking_code"],
    ),
  },
  {
    // Chamador confiável: exige chave mp_ com `checkout:link` (header X-API-Key), além do JWT do
    // usuário. O link autentica quem o abre, então gerar link é privilégio do nosso bot, não de
    // qualquer agente. Ver agent-booking.md §9 item 6 (session fixation).
    name: "create_checkout_link",
    scope: "checkout:link",
    description:
      "Gera um link de uso único que abre o checkout já logado. Entregue este link ao usuário para ele pagar (PIX ou cartão) e receber o voucher. Exige chave de agente confiável. Passe o refresh_token que veio de verify_login_otp.",
    inputSchema: obj(
      {
        booking_code: { type: "string", description: "Código da reserva (MP-...)" },
        refresh_token: { type: "string", description: "O refresh_token da sessão (de verify_login_otp)" },
      },
      ["booking_code", "refresh_token"],
    ),
  },
];

// Nomes das tools que exigem sessão (JWT). O handler recusa cedo, com mensagem amigável, se faltar.
export const CUSTOMER_TXN_NAMES: ReadonlySet<string> = new Set(CUSTOMER_TXN_TOOLS.map((t) => t.name));
