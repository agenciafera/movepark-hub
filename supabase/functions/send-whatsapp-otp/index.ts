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

function b64ToBytes(b64: string): Uint8Array {
  // Aceita base64 padrão e URL-safe
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "===".slice(0, (4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** Tira o prefixo "v1,whsec_" do secret se vier no formato Supabase. */
function parseSecret(raw: string): Uint8Array {
  let s = raw.trim();
  // Múltiplas chaves separadas por espaço — pega a primeira
  s = s.split(/\s+/)[0];
  // "v1,whsec_<b64>" → "<b64>"
  s = s.replace(/^v1,\s*/, "");
  s = s.replace(/^whsec_/, "");
  return b64ToBytes(s);
}

async function verifyStandardWebhook(
  keyBytes: Uint8Array,
  id: string,
  ts: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${id}.${ts}.${body}`);
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const expected = bytesToB64(sigBytes);
  // Header pode ter múltiplas assinaturas separadas por espaço, cada uma "v1,<b64>"
  const parts = signatureHeader.split(/\s+/);
  for (const part of parts) {
    const [_ver, sig] = part.split(",");
    if (sig === expected) return true;
  }
  return false;
}

type Payload = {
  user?: { phone?: string };
  sms?: { otp?: string };
};

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
    const tsNum = parseInt(ts, 10);
    const drift = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
    if (drift > 300) return jsonError(401, "Timestamp fora da janela");
    try {
      const keyBytes = parseSecret(hookSecret);
      const ok = await verifyStandardWebhook(keyBytes, id, ts, raw, sig);
      if (!ok) return jsonError(401, "Assinatura inválida");
    } catch (err) {
      console.error("Erro ao validar assinatura:", err);
      return jsonError(401, "Falha na verificação");
    }
  }

  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonError(400, "JSON inválido");
  }

  const phone = payload.user?.phone?.replace(/\D/g, "");
  const otp = payload.sms?.otp;
  if (!phone || !otp) return jsonError(400, "phone/otp ausentes no payload");

  const components: Array<Record<string, unknown>> = [
    { type: "body", parameters: [{ type: "text", text: otp }] },
  ];
  if (includeOtpButton) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: otp }],
    });
  }

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
