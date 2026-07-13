// WhatsApp Business Cloud API (Meta) — envio de mensagens de TEMPLATE (notificações iniciadas pela
// Movepark, fora da janela de 24h, exigem template aprovado). Notificações de Tarifa (E2.8): só
// para Flex+ (`fare_benefits.notifications_sms`). Degrada como o e-mail: NUNCA lança; se faltar
// config/template, loga e devolve {ok:false} sem derrubar o chamador (webhook/Edge).
//
// Secrets (Edge Function Secrets — já usados pelo send-whatsapp-otp):
//   WHATSAPP_OFFICIAL_PHONE_NUMBER_ID / WHATSAPP_OFFICIAL_TOKEN / WHATSAPP_OFFICIAL_API_VERSION
// Templates (configuráveis; precisam estar APROVADOS no Meta):
//   WHATSAPP_BOOKING_CONFIRMED_TEMPLATE  — confirmação da reserva (params: nome, código)
//   WHATSAPP_BOOKING_EXTENDED_TEMPLATE   — extensão por atraso de voo (params: nome, código, nova saída)
//   WHATSAPP_OFFICIAL_TEMPLATE_LANGUAGE  — default pt_BR

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  language: string;
}

type EnvFn = (key: string) => string | undefined;

/** Lê a config do ambiente. Retorna null se faltar o essencial (phone id + token). */
export function whatsappConfigFromEnv(getEnv: EnvFn): WhatsAppConfig | null {
  const phoneNumberId = getEnv("WHATSAPP_OFFICIAL_PHONE_NUMBER_ID");
  const accessToken = getEnv("WHATSAPP_OFFICIAL_TOKEN");
  if (!phoneNumberId || !accessToken) return null;
  return {
    phoneNumberId,
    accessToken,
    apiVersion: getEnv("WHATSAPP_OFFICIAL_API_VERSION") ?? "v21.0",
    language: getEnv("WHATSAPP_OFFICIAL_TEMPLATE_LANGUAGE") ?? "pt_BR",
  };
}

/** Monta os `components` (body com parâmetros de texto, na ordem). Vazio → sem bloco body. */
export function buildBodyComponents(params: string[]): Array<Record<string, unknown>> {
  if (params.length === 0) return [];
  return [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }];
}

/**
 * Monta os `components` incluindo o botão de copiar código quando o template pede.
 * Template de categoria "autenticação" (o `otp_movepark`) traz um botão Url de copy-code, e a Meta
 * recusa o envio sem o parâmetro dele (erro 131008). Templates de utilidade (reserva confirmada,
 * extensão) não têm botão: passe `urlButtonParams` vazio.
 */
export function buildComponents(
  bodyParams: string[],
  urlButtonParams: string[] = [],
): Array<Record<string, unknown>> {
  const components = buildBodyComponents(bodyParams);
  if (urlButtonParams.length > 0) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: urlButtonParams.map((text) => ({ type: "text", text })),
    });
  }
  return components;
}

/** Telefone BR → E.164 só com dígitos (Meta espera 55DDDNUMERO). null se inválido. */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("55")) digits = "55" + digits;
  return digits.length >= 12 ? digits : null;
}

export interface SendTemplateArgs {
  to: string;
  template: string;
  bodyParams?: string[];
  /** Parâmetros do botão Url (copy-code) — obrigatório nos templates de autenticação. */
  urlButtonParams?: string[];
  config?: WhatsAppConfig | null;
}

/** Envia uma mensagem de template. Nunca lança — devolve {ok}. */
export async function sendWhatsAppTemplate({
  to,
  template,
  bodyParams = [],
  urlButtonParams = [],
  config,
}: SendTemplateArgs): Promise<{ ok: boolean; error?: string }> {
  // @ts-expect-error - Deno env
  const cfg = config ?? whatsappConfigFromEnv((k: string) => Deno.env.get(k));
  if (!cfg) {
    console.warn("[whatsapp] config ausente — mensagem não enviada:", template);
    return { ok: false, error: "WhatsApp não configurado" };
  }
  if (!template) {
    console.warn("[whatsapp] template não configurado — mensagem ignorada");
    return { ok: false, error: "template ausente" };
  }
  const number = toWhatsAppNumber(to);
  if (!number) {
    console.warn("[whatsapp] telefone inválido — mensagem não enviada");
    return { ok: false, error: "telefone inválido" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: number,
          type: "template",
          template: {
            name: template,
            language: { code: cfg.language },
            components: buildComponents(bodyParams, urlButtonParams),
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error("[whatsapp] envio falhou:", res.status, body);
      return { ok: false, error: `meta ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[whatsapp] erro de rede:", e);
    return { ok: false, error: e instanceof Error ? e.message : "erro" };
  }
}
