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
// E0.3.10: também relê os SAQUES abertos (`payout_withdrawal` em created/processing), guardando
// previsão de queda, data em que caiu e motivo de falha (`_shared/payments/withdrawal.ts`).
//
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-reconcile-payout-transfers-key.
// Segunda porta: o Manager chama com o JWT de um hub_admin ("Conferir no gateway").
//
// POST /functions/v1/reconcile-payout-transfers   (header: x-reconcile-payout-transfers-key | Authorization: Bearer <jwt hub_admin>)
// → { ok, checked, updated, withdrawals: { checked, updated }, emails: { checked, sent } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { withdrawalPatch } from "../_shared/payments/withdrawal.ts";
import { sweepWithdrawalEmails } from "../_shared/withdrawal-email.ts";
import { BATCH_LIMIT, decideReconcileTransfer } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ehHubAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false }, global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return false;
    const { data } = await userClient.rpc("is_hub_admin");
    return data === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // A chave interna vem do Vault (a mesma que o cron envia), sem env var para sincronizar.
  const { data: expected } = await admin.rpc("reconcile_payout_transfers_expected_key");
  const pelaChave = !!expected && req.headers.get("x-reconcile-payout-transfers-key") === expected;
  if (!pelaChave && !(await ehHubAdmin(req))) {
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

  // Saques abertos (E0.3.10): mesma leitura, `GET /transfers/{id}`, regra em withdrawalPatch.
  const { data: saques, error: sqErr } = await admin
    .from("payout_withdrawal")
    .select("id, status, external_transfer_id")
    .eq("provider", "pagarme")
    .in("status", ["created", "processing"])
    .not("external_transfer_id", "is", null)
    .is("deleted_at", null)
    .order("requested_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (sqErr) return json({ error: sqErr.message, checked: linhas?.length ?? 0, updated }, 500);

  let saquesAtualizados = 0;
  for (const w of saques ?? []) {
    try {
      const r = await gateway.getTransfer(String(w.external_transfer_id));
      const patch = withdrawalPatch({ result: r, nowIso: new Date().toISOString(), current: w.status });
      if (!patch) continue;
      // `.eq("status")`: se o webhook fechou a linha no meio, não sobrescreve o que ele decidiu.
      const { error: upErr } = await admin
        .from("payout_withdrawal")
        .update(patch)
        .eq("id", w.id)
        .eq("status", w.status);
      if (upErr) {
        console.error("[reconcile-payout-transfers] saque não atualizou:", w.id, upErr.message);
        continue;
      }
      if (patch.status) saquesAtualizados += 1;
    } catch (e) {
      console.error("[reconcile-payout-transfers] falha no saque", w.external_transfer_id, e);
    }
  }

  // E-mails de saque (pedido ainda não avisado, desfecho sem aviso): a varredura pega o que a
  // Edge do saque não conseguiu mandar e o que acabou de fechar acima.
  const emails = await sweepWithdrawalEmails(admin);

  return json({
    ok: true,
    checked: linhas?.length ?? 0,
    updated,
    withdrawals: { checked: saques?.length ?? 0, updated: saquesAtualizados },
    emails,
  });
});
