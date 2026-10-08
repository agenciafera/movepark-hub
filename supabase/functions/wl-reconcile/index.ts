// Edge Function: /wl-reconcile
// Reconciliação WL→Hub (E2.5.2): pra cada empresa com sync ligado + cada tipo de vaga mapeado, puxa o
// GET /availability do white-label numa janela e grava external_booked_count (= sold_wl) via RPC
// wl_reconcile_apply (preserva booked_count, loga divergência). É o que torna o anti-overbooking real.
// Chamada interna pelo pg_cron (pg_net) — header x-wl-deliver-key (secret WL_DELIVER_KEY). verify_jwt = false.
//
// Cada vaga deixa rastro em `wl_sync_state` (08/10/2026): leitura boa carimba `reconciled_at`
// (dentro de wl_reconcile_apply), falha grava a mensagem por wl_reconcile_fail. Antes a falha só
// ia ao console, e um WL fora do ar congelava `external_booked_count` sem ninguém ver.
//
// POST /functions/v1/wl-reconcile   (header: x-wl-deliver-key: <WL_DELIVER_KEY>)
// → { ok, lpts, changed, failed }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  wlGetAvailability,
  wlReady,
  type WlConfig,
  hasInternalKey,
} from "../_shared/wl/client.ts";
import { buildReconcileRows, reconcileWindow } from "./logic.ts";

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
  if (!token) return json({ error: "WL_BACKEND_TOKEN ausente" }, 500);

  // tipos de vaga mapeados de empresas com sync ligado
  const { data: lpts, error } = await admin
    .from("location_parking_type")
    .select(
      "id, wl_category_slug, wl_product_slug, location:location!inner(company:company!inner(wl_domain, wl_tenant_key, wl_sync_enabled))",
    )
    .eq("is_active", true)
    .not("wl_category_slug", "is", null)
    .not("wl_product_slug", "is", null)
    // Mesmo recorte da view `wl_reconcile_target`, que a saúde usa.
    .is("location.deleted_at", null)
    .is("location.company.deleted_at", null);
  if (error) return json({ error: error.message }, 500);

  const win = reconcileWindow(new Date(), 90);
  let processed = 0;
  let changed = 0;
  let failed = 0;

  for (const lpt of lpts ?? []) {
    // deno-lint-ignore no-explicit-any
    const cfg = (lpt as any).location?.company as WlConfig | null;
    if (!wlReady(cfg)) continue;
    try {
      const days = await wlGetAvailability(cfg!, token, {
        category_slug: lpt.wl_category_slug as string,
        product_slug: lpt.wl_product_slug as string,
        start_date: win.start,
        end_date: win.end,
      });
      const rows = buildReconcileRows(days);
      const { data: n, error: applyErr } = await admin.rpc("wl_reconcile_apply", {
        p_lpt_id: lpt.id,
        p_rows: rows,
      });
      if (applyErr) throw new Error(`apply: ${applyErr.message}`);
      processed++;
      changed += Number(n ?? 0);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failed++;
      console.error(`reconcile ${lpt.id}:`, message);
      await admin.rpc("wl_reconcile_fail", { p_lpt_id: lpt.id, p_error: message });
    }
  }

  return json({ ok: true, lpts: processed, changed, failed });
});
