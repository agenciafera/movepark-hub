// Edge Function: /send-whatsapp-otp
// Webhook chamado pelo Supabase Send SMS Hook (Auth → Hooks → Send SMS Hook).
// Quando o cliente chama `supabase.auth.signInWithOtp({ phone, options: { channel: 'whatsapp' } })`,
// Supabase gera o OTP e dispara POST aqui no formato Standard Webhooks:
//
// Headers:
//   webhook-id:        <uuid>
//   webhook-timestamp: <unix-seconds>
//   webhook-signature: v1,<base64(HMAC-SHA256(secret, "<id>.<ts>.<body>"))>
//
// Body:
// {
//   "user": { "id": "...", "phone": "5511999999999", ... },
//   "sms": { "otp": "123456", "otp_type": "..." }
// }
//
// A função verifica a assinatura, monta a chamada de template OTP da
// WhatsApp Business Cloud API (Meta) e devolve 200.

import {
  buildTemplateComponents,
  extractOtp,
  type OtpPayload,
  parseSecret,
  timestampWithinWindow,
  verifyStandardWebhook,
} from "./webhook.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, webhook-id, webhook-signature, webhook-timestamp, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  const phoneNumberId = Deno.env.get("WHATSAPP_OFFICIAL_PHONE_NUMBER_ID");
  const accessToken = Deno.env.get("WHATSAPP_OFFICIAL_TOKEN");
  const templateName =
    Deno.env.get("WHATSAPP_OFFICIAL_TEMPLATE_NAME") ?? "otp_movepark";
  const templateLang =
    Deno.env.get("WHATSAPP_OFFICIAL_TEMPLATE_LANGUAGE") ?? "pt_BR";
  const apiVersion = Deno.env.get("WHATSAPP_OFFICIAL_API_VERSION") ?? "v21.0";
  const includeOtpButton =
    (Deno.env.get("WHATSAPP_INCLUDE_OTP_BUTTON") ?? "false").toLowerCase() ===
    "true";
  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");

  if (!phoneNumberId || !accessToken) {
    return jsonError(
      500,
      "WHATSAPP_OFFICIAL_PHONE_NUMBER_ID / WHATSAPP_OFFICIAL_TOKEN não configurados",
    );
  }

  const raw = await req.text();

  // Verificação Standard Webhooks
  if (hookSecret) {
    const id = req.headers.get("webhook-id");
    const ts = req.headers.get("webhook-timestamp");
    const sig = req.headers.get("webhook-signature");
    if (!id || !ts || !sig) {
      return jsonError(401, "Headers webhook-* ausentes");
    }
    // Anti-replay: timestamp deve estar a até 5min do agora
    if (!timestampWithinWindow(ts, Math.floor(Date.now() / 1000))) {
      return jsonError(401, "Timestamp fora da janela");
    }
    try {
      const keyBytes = parseSecret(hookSecret);
      const ok = await verifyStandardWebhook(keyBytes, id, ts, raw, sig);
      if (!ok) return jsonError(401, "Assinatura inválida");
    } catch (err) {
      console.error("Erro ao validar assinatura:", err);
      return jsonError(401, "Falha na verificação");
    }
  }

  let payload: OtpPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonError(400, "JSON inválido");
  }

  const parsed = extractOtp(payload);
  if (!parsed) return jsonError(400, "phone/otp ausentes no payload");
  const { phone, otp } = parsed;

  const components = buildTemplateComponents(otp, includeOtpButton);

  const res = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          components,
        },
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Meta WhatsApp send failed:", res.status, errBody);
    return jsonError(502, `Falha ao enviar pelo WhatsApp: ${errBody}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
});
