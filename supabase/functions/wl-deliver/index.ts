// Edge Function: /wl-deliver
// Entrega outbound Hub→WL (E2.5.2): reivindica as pendentes vencidas da outbox `wl_delivery` pela
// RPC `wl_delivery_claim` e empurra reserve/release pro `/availability/sync` do white-label (via
// _shared/wl/client), com retry/backoff.
//
// A reivindicação (08/10/2026) resolve duas coisas que a leitura direta da tabela não resolvia:
// ordem (o release só sai depois do reserve do mesmo id, senão o WL ignora o release e a vaga
// fica presa) e concorrência (a linha ganha uma concessão de 5 minutos, e outra execução do cron
// não a pega no meio). Se esta Edge morrer sem gravar o resultado, a linha volta sozinha quando
// a concessão vence.
// Chamada interna pelo pg_cron (pg_net) — protegida por header x-wl-deliver-key (secret WL_DELIVER_KEY).
// verify_jwt = false (server-to-server por header próprio). O Bearer do WL é o secret WL_BACKEND_TOKEN.
//
// POST /functions/v1/wl-deliver   (header: x-wl-deliver-key: <WL_DELIVER_KEY>)
// → { ok, scanned, delivered, retried, failed }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  wlErrorStatus,
  wlPostSync,
  wlReady,
  type SyncBody,
  type WlConfig,
  hasInternalKey,
} from "../_shared/wl/client.ts";
import { nextBackoff } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // @ts-expect-error - Deno env
  const expected = Deno.env.get("WL_DELIVER_KEY");
  if (!hasInternalKey(req, expected)) {
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

  const { data: rows, error } = await admin.rpc("wl_delivery_claim", { p_limit: 50 });
  if (error) return json({ error: error.message }, 500);

  let delivered = 0;
  let retried = 0;
  let failed = 0;

  for (const d of rows ?? []) {
    const cfg: WlConfig = {
      wl_domain: d.wl_domain,
      wl_tenant_key: d.wl_tenant_key,
      wl_sync_enabled: d.wl_sync_enabled,
    };
    const attempts = (d.attempts ?? 0) + 1;
    let ok = false;
    let errText: string | null = null;
    let httpStatus: number | null = null;

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
      await wlPostSync(cfg, token, d.payload as unknown as SyncBody);
      ok = true;
    } catch (e) {
      errText = e instanceof Error ? e.message : String(e);
      httpStatus = wlErrorStatus(e);
    }

    if (ok) {
      await admin
        .from("wl_delivery")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          attempts,
          last_error: null,
          last_status: 200,
        })
        .eq("id", d.id);
      delivered++;
    } else if (attempts >= (d.max_attempts ?? 6)) {
      await admin
        .from("wl_delivery")
        .update({ status: "failed", attempts, last_error: errText, last_status: httpStatus })
        .eq("id", d.id);
      failed++;
    } else {
      const next = new Date(Date.now() + nextBackoff(attempts) * 1000).toISOString();
      await admin
        .from("wl_delivery")
        .update({ attempts, next_attempt_at: next, last_error: errText, last_status: httpStatus })
        .eq("id", d.id);
      retried++;
    }
  }

  return json({ ok: true, scanned: (rows ?? []).length, delivered, retried, failed });
});
