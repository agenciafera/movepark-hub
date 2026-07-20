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
];
