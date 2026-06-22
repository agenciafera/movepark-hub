// Edge Function: /wps-deliver
// Entrega outbound do WPS (E2.6.1): lê a outbox `wps_delivery` (pendentes vencidas), assina o corpo
// com HMAC-SHA256 (segredo do parceiro) e faz POST no webhook do pátio, com retry/backoff.
// Chamada interna pelo pg_cron (pg_net) — protegida por header x-wps-deliver-key (secret WPS_DELIVER_KEY).
// verify_jwt = false (chamada server-to-server por header próprio).
//
// POST /functions/v1/wps-deliver   (header: x-wps-deliver-key: <WPS_DELIVER_KEY>)
// → { ok, scanned, delivered, retried, failed }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyResult, nextBackoff, signPayload } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // @ts-expect-error - Deno env
  const expected = Deno.env.get("WPS_DELIVER_KEY");
  if (!expected || req.headers.get("x-wps-deliver-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: rows, error } = await admin
    .from("wps_delivery")
    .select("id, event_id, type, payload, target_url, attempts, max_attempts, company:company!inner(wps_webhook_secret)")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(50);
  if (error) return json({ error: error.message }, 500);

  let delivered = 0;
  let retried = 0;
  let failed = 0;

  for (const d of rows ?? []) {
    // deno-lint-ignore no-explicit-any
    const secret = (d as any).company?.wps_webhook_secret as string | null;
    const bodyStr = JSON.stringify(d.payload);
    let statusCode = 0;
    let errText: string | null = null;
    try {
      const sig = secret ? await signPayload(secret, bodyStr) : "";
      const res = await fetch(d.target_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Movepark-Event": d.type,
          "X-Movepark-Event-Id": d.event_id,
          ...(sig ? { "X-Movepark-Signature": `sha256=${sig}` } : {}),
        },
        body: bodyStr,
      });
      statusCode = res.status;
    } catch (e) {
      errText = e instanceof Error ? e.message : String(e);
    }

    const attempts = (d.attempts ?? 0) + 1;
    if (statusCode && classifyResult(statusCode) === "delivered") {
      await admin
        .from("wps_delivery")
        .update({ status: "delivered", delivered_at: new Date().toISOString(), attempts, last_status: statusCode, last_error: null })
        .eq("id", d.id);
      delivered++;
    } else if (attempts >= (d.max_attempts ?? 6)) {
      await admin
        .from("wps_delivery")
        .update({ status: "failed", attempts, last_status: statusCode || null, last_error: errText ?? `HTTP ${statusCode}` })
        .eq("id", d.id);
      failed++;
    } else {
      const next = new Date(Date.now() + nextBackoff(attempts) * 1000).toISOString();
      await admin
        .from("wps_delivery")
        .update({ attempts, next_attempt_at: next, last_status: statusCode || null, last_error: errText ?? `HTTP ${statusCode}` })
        .eq("id", d.id);
      retried++;
    }
  }

  return json({ ok: true, scanned: (rows ?? []).length, delivered, retried, failed });
});
