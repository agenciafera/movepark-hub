// Lógica pura da Edge ses-events (19/11/2026): conferir a mensagem do SNS e converter o evento do
// SES em linhas de `email_event`. Sem rede e sem banco, para o deno test cobrir cada ramo.
// Ver docs/specs/email-eventos-ses.md.

import { createVerify } from "node:crypto";

/** Os campos que o SNS manda no corpo do POST (JSON, mesmo com Content-Type text/plain). */
export interface SnsMessage {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}

const TIPOS_SNS = new Set(["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"]);

/** Valida a forma do corpo. Devolve null se faltar campo obrigatório ou o tipo for desconhecido. */
export function parseSnsMessage(body: unknown): SnsMessage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const obrigatorios = ["Type", "MessageId", "TopicArn", "Message", "Timestamp", "SignatureVersion", "Signature", "SigningCertURL"];
  for (const k of obrigatorios) if (typeof b[k] !== "string" || b[k] === "") return null;
  if (!TIPOS_SNS.has(b.Type as string)) return null;
  if (b.Type !== "Notification" && (typeof b.SubscribeURL !== "string" || typeof b.Token !== "string")) return null;
  return b as unknown as SnsMessage;
}

/**
 * O texto que o SNS assinou: pares "Chave\nValor\n" em ordem fixa, que muda com o tipo.
 * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 */
export function snsStringToSign(m: SnsMessage): string {
  const chaves = m.Type === "Notification"
    ? ["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  const rec = m as unknown as Record<string, string>;
  return chaves.map((k) => `${k}\n${rec[k]}\n`).join("");
}

/**
 * Só endereço do próprio SNS: https, host `sns.<região>.amazonaws.com`. Vale para o certificado
 * (que ainda tem que terminar em .pem) e para o SubscribeURL. Sem isso, quem forjasse a mensagem
 * apontaria o certificado para um servidor dele e a assinatura "conferiria".
 */
export function isAwsSnsUrl(raw: string, kind: "cert" | "subscribe"): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port !== "" || u.username || u.password) return false;
  // O rótulo do meio tem forma de região (sa-east-1, us-gov-west-1): "sns.s3-us-west-2..." é um
  // bucket do S3 chamado "sns", e não o SNS.
  if (!/^sns\.[a-z]{2}(-gov)?-[a-z]+-\d+\.amazonaws\.com$/.test(u.hostname)) return false;
  return kind === "cert" ? u.pathname.endsWith(".pem") : true;
}

/** Confere a assinatura com o certificado (PEM) do SNS. Versão 1 = SHA1, versão 2 = SHA256. */
export function verifySnsSignature(m: SnsMessage, certPem: string): boolean {
  const algo = m.SignatureVersion === "1" ? "RSA-SHA1" : m.SignatureVersion === "2" ? "RSA-SHA256" : null;
  if (!algo) return false;
  try {
    const v = createVerify(algo);
    v.update(snsStringToSign(m), "utf8");
    return v.verify(certPem, m.Signature, "base64");
  } catch {
    return false;
  }
}

/** Uma linha de `email_event`. */
export interface EmailEventRow {
  sns_message_id: string;
  event_type: "bounce" | "complaint" | "delivery" | "reject" | "delivery_delay" | "rendering_failure";
  recipient: string;
  ses_message_id: string | null;
  subject: string | null;
  sender: string | null;
  bounce_type: string | null;
  bounce_subtype: string | null;
  diagnostic: string | null;
  occurred_at: string;
  raw: unknown;
}

// eventType do event publishing (configuration set) e notificationType das notificações por identidade.
const TIPO_SES: Record<string, EmailEventRow["event_type"]> = {
  Bounce: "bounce",
  Complaint: "complaint",
  Delivery: "delivery",
  Reject: "reject",
  DeliveryDelay: "delivery_delay",
  "Rendering Failure": "rendering_failure",
  RenderingFailure: "rendering_failure",
};

/** "Fulano <A@Ex.com>" ou "A@Ex.com" → "a@ex.com". Vazio se não houver endereço. */
export function normalizeAddress(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

const str = (v: unknown, max = 1000): string | null => (typeof v === "string" && v !== "" ? v.slice(0, max) : null);

/**
 * Converte o evento do SES (o JSON dentro de `Message`) em uma linha por destinatário. Tipo que não
 * interessa (Send, Open, Click) vira lista vazia. O evento inteiro vai em `raw`, menos na entrega,
 * que é volume.
 */
// deno-lint-ignore no-explicit-any
export function sesEventRows(snsMessageId: string, ev: any): EmailEventRow[] {
  if (!ev || typeof ev !== "object") return [];
  const tipo = TIPO_SES[String(ev.eventType ?? ev.notificationType ?? "")];
  if (!tipo) return [];
  const mail = ev.mail ?? {};
  const base = {
    sns_message_id: snsMessageId,
    event_type: tipo,
    ses_message_id: str(mail.messageId, 200),
    subject: str(mail.commonHeaders?.subject, 300),
    sender: str(mail.source, 300),
    raw: tipo === "delivery" ? null : ev,
  };
  const quando = (t: unknown) => str(t, 64) ?? str(mail.timestamp, 64) ?? new Date().toISOString();

  // deno-lint-ignore no-explicit-any
  let itens: { endereco: unknown; bounce_type?: unknown; bounce_subtype?: unknown; diagnostic?: unknown; t?: unknown }[] = [];
  if (tipo === "bounce") {
    const b = ev.bounce ?? {};
    // deno-lint-ignore no-explicit-any
    itens = (b.bouncedRecipients ?? []).map((r: any) => ({
      endereco: r?.emailAddress, bounce_type: b.bounceType, bounce_subtype: b.bounceSubType,
      diagnostic: r?.diagnosticCode ?? r?.status, t: b.timestamp,
    }));
  } else if (tipo === "complaint") {
    const c = ev.complaint ?? {};
    // deno-lint-ignore no-explicit-any
    itens = (c.complainedRecipients ?? []).map((r: any) => ({
      endereco: r?.emailAddress, bounce_type: c.complaintFeedbackType, bounce_subtype: c.complaintSubType, t: c.timestamp,
    }));
  } else if (tipo === "delivery") {
    const d = ev.delivery ?? {};
    itens = (d.recipients ?? []).map((r: unknown) => ({ endereco: r, diagnostic: d.smtpResponse, t: d.timestamp }));
  } else if (tipo === "delivery_delay") {
    const d = ev.deliveryDelay ?? {};
    // deno-lint-ignore no-explicit-any
    itens = (d.delayedRecipients ?? []).map((r: any) => ({
      endereco: r?.emailAddress, bounce_type: d.delayType, diagnostic: r?.diagnosticCode ?? r?.status, t: d.timestamp,
    }));
  } else {
    // reject e rendering_failure não listam destinatário próprio: vale o envelope.
    const motivo = tipo === "reject" ? ev.reject?.reason : ev.failure?.errorMessage;
    itens = (mail.destination ?? []).map((r: unknown) => ({ endereco: r, diagnostic: motivo, t: mail.timestamp }));
  }

  const vistos = new Set<string>();
  const rows: EmailEventRow[] = [];
  for (const i of itens) {
    const recipient = normalizeAddress(i.endereco);
    if (!recipient || vistos.has(recipient)) continue;
    vistos.add(recipient);
    rows.push({
      ...base,
      recipient,
      bounce_type: str(i.bounce_type, 64),
      bounce_subtype: str(i.bounce_subtype, 64),
      diagnostic: str(i.diagnostic),
      occurred_at: quando(i.t),
    });
  }
  return rows;
}
