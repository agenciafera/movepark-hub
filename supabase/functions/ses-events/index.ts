// Edge Function: /ses-events (19/11/2026)
// Recebe do Amazon SNS os eventos do SES (devolução, reclamação, entrega, recusa, atraso) e grava em
// `email_event`, uma linha por destinatário. Existe porque o `sendEmail` só sabe se o SES ACEITOU:
// em 19/11/2026 o resumo da Pare Seguro sumiu por dias com o Gmail e o Outlook recusando depois, e
// ninguém no Hub viu. Ver docs/specs/email-eventos-ses.md.
//
// POST /functions/v1/ses-events   (o SNS manda JSON com Content-Type text/plain)
//   verify_jwt = false: quem chama é o SNS, sem JWT. A porta é a assinatura do SNS mais o tópico:
//   1. TopicArn tem que ser o de `app_setting.ses_events_topic_arn` (vazio = recusa tudo). Sem isso,
//      qualquer conta da AWS assinaria uma mensagem válida de um tópico dela apontando para cá.
//   2. SigningCertURL tem que ser https://sns.<região>.amazonaws.com/...pem, e a assinatura confere.
//   SubscriptionConfirmation → abre o SubscribeURL (também só host do SNS) e confirma a inscrição.
//   Notification → grava as linhas (idempotente por MessageId + destinatário). 500 faz o SNS tentar
//   de novo; 403 é mensagem que não é nossa.
// → 200 { ok, rows? } | 400 | 403 | 405 | 500

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAwsSnsUrl, parseSnsMessage, sesEventRows, verifySnsSignature } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// O certificado do SNS muda raramente; guardar por instância evita um fetch por evento.
const certCache = new Map<string, string>();
async function certPem(url: string): Promise<string | null> {
  const hit = certCache.get(url);
  if (hit) return hit;
  const r = await fetch(url, { redirect: "error" });
  if (!r.ok) return null;
  const pem = await r.text();
  if (!pem.includes("BEGIN CERTIFICATE")) return null;
  certCache.set(url, pem);
  return pem;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json({ error: "corpo inválido" }, 400);
  }
  const msg = parseSnsMessage(body);
  if (!msg) return json({ error: "mensagem do SNS inválida" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: cfg } = await admin.from("app_setting").select("value").eq("key", "ses_events_topic_arn").maybeSingle();
  const topico = String(cfg?.value ?? "").trim();
  if (!topico || msg.TopicArn !== topico) {
    console.warn("[ses-events] tópico fora da allowlist:", msg.TopicArn);
    return json({ error: "tópico não aceito" }, 403);
  }

  if (!isAwsSnsUrl(msg.SigningCertURL, "cert")) return json({ error: "certificado fora do SNS" }, 403);
  const pem = await certPem(msg.SigningCertURL).catch(() => null);
  if (!pem || !verifySnsSignature(msg, pem)) {
    console.warn("[ses-events] assinatura não confere:", msg.MessageId);
    return json({ error: "assinatura inválida" }, 403);
  }

  if (msg.Type === "SubscriptionConfirmation") {
    if (!isAwsSnsUrl(msg.SubscribeURL!, "subscribe")) return json({ error: "SubscribeURL fora do SNS" }, 403);
    const r = await fetch(msg.SubscribeURL!, { redirect: "error" }).catch(() => null);
    if (!r?.ok) return json({ error: "não confirmou a inscrição" }, 500);
    console.log("[ses-events] inscrição confirmada em", msg.TopicArn);
    return json({ ok: true, subscribed: true });
  }
  if (msg.Type === "UnsubscribeConfirmation") {
    console.warn("[ses-events] inscrição cancelada em", msg.TopicArn);
    return json({ ok: true });
  }

  let evento: unknown;
  try {
    evento = JSON.parse(msg.Message);
  } catch {
    // Mensagem de teste do console do SNS: texto solto, nada a gravar.
    return json({ ok: true, rows: 0 });
  }
  const rows = sesEventRows(msg.MessageId, evento);
  if (rows.length === 0) return json({ ok: true, rows: 0 });

  const { error } = await admin.from("email_event")
    .upsert(rows, { onConflict: "sns_message_id,recipient", ignoreDuplicates: true });
  if (error) {
    console.error("[ses-events] falha ao gravar:", error.message);
    return json({ error: "falha ao gravar" }, 500);
  }
  const problemas = rows.filter((r) => r.event_type !== "delivery");
  if (problemas.length) {
    console.warn("[ses-events]", problemas.map((r) => `${r.event_type} ${r.recipient}`).join(", "));
  }
  return json({ ok: true, rows: rows.length });
});
