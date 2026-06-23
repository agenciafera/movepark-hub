// Edge Function: /wl-deliver
// Entrega outbound Hub→WL (E2.5.2): lê a outbox `wl_delivery` (pendentes vencidas) e empurra
// reserve/release pro `/availability/sync` do white-label (via _shared/wl/client), com retry/backoff.
// Chamada interna pelo pg_cron (pg_net) — protegida por header x-wl-deliver-key (secret WL_DELIVER_KEY).
// verify_jwt = false (server-to-server por header próprio). O Bearer do WL é o secret WL_BACKEND_TOKEN.
//
// POST /functions/v1/wl-deliver   (header: x-wl-deliver-key: <WL_DELIVER_KEY>)
// → { ok, scanned, delivered, retried, failed }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { wlPostSync, wlReady, type SyncBody, type WlConfig } from "../_shared/wl/client.ts";
import { nextBackoff } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // @ts-expect-error - Deno env
  const expected = Deno.env.get("WL_DELIVER_KEY");
  if (!expected || req.headers.get("x-wl-deliver-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  // @ts-expect-error - Deno env
  const token = Deno.env.get("WL_BACKEND_TOKEN");

  const { data: rows, error } = await admin
    .from("wl_delivery")
    .select(
      "id, event_id, operation, payload, attempts, max_attempts, company:company!inner(wl_domain, wl_tenant_key, wl_sync_enabled)",
    )
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
    const cfg = (d as any).company as WlConfig | null;
    const attempts = (d.attempts ?? 0) + 1;
    let ok = false;
    let errText: string | null = null;

    if (!token || !wlReady(cfg)) {
      // integração desligada/sem token → não adianta retentar
      await admin
        .from("wl_delivery")
        .update({ status: "failed", attempts, last_error: "WL desligado ou WL_BACKEND_TOKEN ausente" })
        .eq("id", d.id);
      failed++;
      continue;
    }

    try {
      await wlPostSync(cfg!, token, d.payload as unknown as SyncBody);
      ok = true;
    } catch (e) {
      errText = e instanceof Error ? e.message : String(e);
    }

    if (ok) {
      await admin
        .from("wl_delivery")
        .update({ status: "delivered", delivered_at: new Date().toISOString(), attempts, last_error: null })
        .eq("id", d.id);
      delivered++;
    } else if (attempts >= (d.max_attempts ?? 6)) {
      await admin
        .from("wl_delivery")
        .update({ status: "failed", attempts, last_error: errText })
        .eq("id", d.id);
      failed++;
    } else {
      const next = new Date(Date.now() + nextBackoff(attempts) * 1000).toISOString();
      await admin
        .from("wl_delivery")
        .update({ attempts, next_attempt_at: next, last_error: errText })
        .eq("id", d.id);
      retried++;
    }
  }

  return json({ ok: true, scanned: (rows ?? []).length, delivered, retried, failed });
});
