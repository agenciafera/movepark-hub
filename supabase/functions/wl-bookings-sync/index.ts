// Edge Function: /wl-bookings-sync
// Importa as reservas feitas no site white-label de cada parceiro para `wl_booking`
// (docs/specs/reservas-wl-no-hub.md). Lê o legado por GET /api/v3/backend/orders, uma página por vez,
// a partir do cursor salvo em `wl_booking_sync_state`, e grava cada página pela RPC
// `wl_booking_apply_page`, que avança o cursor na mesma transação.
//
// A tabela é à parte: nada de capacidade, repasse, comissão, e-mail ou KPI do Hub olha para ela.
// Nasce DESLIGADA (app_setting.wl_booking_import.enabled = false) porque a rota do legado só existe
// depois do merge de agenciafera/movepark-backoffice#614; desligada, a Edge responde e sai.
//
// Chamada interna pelo pg_cron (pg_net), header x-wl-deliver-key. verify_jwt = false.
//
// POST /functions/v1/wl-bookings-sync   (header: x-wl-deliver-key: <WL_DELIVER_KEY>)
// body opcional: { company_id?: uuid }  → limita a uma empresa (útil pra rodar na mão)
// → { ok, enabled, companies, pages, written, skipped, errors }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  wlListOrders,
  type WlConfig,
  type WlOrdersCursor,
  hasInternalKey,
} from "../_shared/wl/client.ts";
import { cursorStuck, readPolicy, START_BUDGET_MS } from "./logic.ts";

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

  const { data: rawPolicy, error: policyErr } = await admin.rpc("wl_booking_import_policy");
  if (policyErr) return json({ error: policyErr.message }, 500);
  const policy = readPolicy(rawPolicy);
  if (!policy.enabled) return json({ ok: true, enabled: false });

  // @ts-expect-error - Deno env
  const token = Deno.env.get("WL_BACKEND_TOKEN");
  if (!token) return json({ error: "WL_BACKEND_TOKEN ausente" }, 500);

  const body = await req.json().catch(() => ({}));
  const onlyCompany = (body as { company_id?: string }).company_id ?? null;

  let q = admin
    .from("wl_booking_import_target")
    .select("company_id, company:company!inner(wl_domain, wl_tenant_key, wl_sync_enabled)");
  if (onlyCompany) q = q.eq("company_id", onlyCompany);
  const { data: targets, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const started = Date.now();
  let pages = 0;
  let written = 0;
  let skipped = 0;
  const errors: { company_id: string; message: string }[] = [];

  for (const t of targets ?? []) {
    // deno-lint-ignore no-explicit-any
    const row = t as any;
    const cfg = row.company as WlConfig;

    const { data: state } = await admin
      .from("wl_booking_sync_state")
      .select("cursor_updated_since, cursor_after_id")
      .eq("company_id", row.company_id)
      .maybeSingle();
    let cursor: WlOrdersCursor = {
      updated_since: state?.cursor_updated_since ?? "1970-01-01 00:00:00",
      after_id: Number(state?.cursor_after_id ?? 0),
    };

    try {
      // Uma empresa grande (carga inicial) não pode tomar a invocação inteira: o orçamento para
      // de pedir página nova, e o cursor salvo continua de onde parou na próxima passada.
      while (Date.now() - started < START_BUDGET_MS) {
        const page = await wlListOrders(cfg, token, cursor, policy.pageLimit);
        const { data: applied, error: applyErr } = await admin.rpc("wl_booking_apply_page", {
          p_company_id: row.company_id,
          p_rows: page.rows,
          p_next_updated_since: page.nextCursor.updated_since,
          p_next_after_id: page.nextCursor.after_id,
        });
        if (applyErr) throw new Error(`apply: ${applyErr.message}`);
        pages++;
        written += Number((applied as { written?: number } | null)?.written ?? 0);
        skipped += Number((applied as { skipped?: number } | null)?.skipped ?? 0);

        if (cursorStuck(cursor, page.nextCursor, page.hasMore)) {
          throw new Error(`cursor parado em ${cursor.updated_since} / ${cursor.after_id}`);
        }
        cursor = page.nextCursor;
        if (!page.hasMore) break;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ company_id: row.company_id, message });
      await admin.rpc("wl_booking_sync_fail", { p_company_id: row.company_id, p_error: message });
    }
  }

  return json({
    ok: true,
    enabled: true,
    companies: (targets ?? []).length,
    pages,
    written,
    skipped,
    errors,
  });
});
