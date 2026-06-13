// Lógica pura do Send SMS Hook (WhatsApp OTP). Sem `Deno.serve`/fetch → testável.
// Verificação Standard Webhooks (HMAC-SHA256) + parsing do payload + montagem do
// template da WhatsApp Cloud API. Ver index.ts para o handler HTTP.

export function b64ToBytes(b64: string): Uint8Array {
  // Aceita base64 padrão e URL-safe
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "===".slice(0, (4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** Tira o prefixo "v1,whsec_" do secret se vier no formato Supabase. */
export function parseSecret(raw: string): Uint8Array {
  let s = raw.trim();
  // Múltiplas chaves separadas por espaço — pega a primeira
  s = s.split(/\s+/)[0];
  // "v1,whsec_<b64>" → "<b64>"
  s = s.replace(/^v1,\s*/, "");
  s = s.replace(/^whsec_/, "");
  return b64ToBytes(s);
}

/** Assina o payload Standard Webhooks ("<id>.<ts>.<body>") com a chave dada. */
export async function signStandardWebhook(
  keyBytes: Uint8Array,
  id: string,
  ts: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${id}.${ts}.${body}`);
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return bytesToB64(sigBytes);
}

export async function verifyStandardWebhook(
  keyBytes: Uint8Array,
  id: string,
  ts: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  const expected = await signStandardWebhook(keyBytes, id, ts, body);
  // Header pode ter múltiplas assinaturas separadas por espaço, cada uma "v1,<b64>"
  const parts = signatureHeader.split(/\s+/);
  for (const part of parts) {
    const sig = part.split(",")[1]; // formato "v1,<b64>"
    if (sig === expected) return true;
  }
  return false;
}

/** Anti-replay: timestamp (unix-seconds) deve estar a até `maxDriftSec` do agora. */
export function timestampWithinWindow(
  ts: string,
  nowSec: number,
  maxDriftSec = 300,
): boolean {
  const tsNum = parseInt(ts, 10);
  if (Number.isNaN(tsNum)) return false;
  return Math.abs(nowSec - tsNum) <= maxDriftSec;
}

export type OtpPayload = {
  user?: { phone?: string };
  sms?: { otp?: string };
};

/** Extrai phone (só dígitos) + otp do payload do hook. `null` se faltar algo. */
export function extractOtp(payload: OtpPayload): { phone: string; otp: string } | null {
  const phone = payload.user?.phone?.replace(/\D/g, "");
  const otp = payload.sms?.otp;
  if (!phone || !otp) return null;
  return { phone, otp };
}

/** Monta os `components` do template OTP da WhatsApp Cloud API. */
export function buildTemplateComponents(
  otp: string,
  includeOtpButton: boolean,
): Array<Record<string, unknown>> {
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
  return components;
}
