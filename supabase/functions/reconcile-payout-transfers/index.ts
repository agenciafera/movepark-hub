// Edge Function: /reconcile-payout-transfers
// Conciliação do repasse ao parceiro (E0.3.4) por polling.
//
// Por que existe: nenhum evento `transfer.*` chegou ao webhook em toda a história da conta (medido
// em 15/09/2026), então o status do repasse não pode depender dele. Sem esta varredura, um repasse
// que não voltasse `transferred` na própria resposta ficaria em `processing` para sempre, contando
// como repassado e ocupando o índice de um em andamento: a empresa nunca receberia o segundo.
//
// Só relê: nunca dispara transferência. Consulta `GET /transfers/{id}` para as linhas em
// `processing` com id do gateway e aplica a mesma regra do webhook (`nextTransferRowStatus`).
//
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-reconcile-payout-transfers-key.
//
// POST /functions/v1/reconcile-payout-transfers   (header: x-reconcile-payout-transfers-key)
// → { ok, checked, updated }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { BATCH_LIMIT, decideReconcileTransfer } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // A chave interna vem do Vault (a mesma que o cron envia), sem env var para sincronizar.
  const { data: expected } = await admin.rpc("reconcile_payout_transfers_expected_key");
  if (!expected || req.headers.get("x-reconcile-payout-transfers-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  // Mais antigo primeiro: é o que está travando a empresa há mais tempo.
  const { data: linhas, error } = await admin
    .from("payout_transfer")
    .select("id, status, external_transfer_id")
    .eq("provider", "pagarme")
    .eq("status", "processing")
    .not("external_transfer_id", "is", null)
    .is("deleted_at", null)
    .order("requested_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) return json({ error: error.message }, 500);

  let updated = 0;
  for (const l of linhas ?? []) {
    try {
      const r = await gateway.getTransfer(String(l.external_transfer_id));
      const next = decideReconcileTransfer({
        current: l.status,
        httpStatus: r.httpStatus,
        rawStatus: r.status,
      });
      if (!next) continue;
      const patch: Record<string, unknown> = { status: next, raw: r.raw };
      if (next === "paid") patch.paid_at = new Date().toISOString();
      if (next === "failed" || next === "canceled") patch.failed_reason = `gateway: ${r.status}`;
      // `.eq("status", l.status)`: se o webhook fechou a linha entre a leitura e a escrita, não
      // sobrescreve o que ele decidiu.
      const { error: upErr } = await admin
        .from("payout_transfer")
        .update(patch)
        .eq("id", l.id)
        .eq("status", l.status);
      if (upErr) {
        console.error("[reconcile-payout-transfers] update falhou:", l.id, upErr.message);
        continue;
      }
      updated += 1;
    } catch (e) {
      console.error("[reconcile-payout-transfers] falha em", l.external_transfer_id, e);
    }
  }

  return json({ ok: true, checked: linhas?.length ?? 0, updated });
});
