// Edge Function: /reconcile-gateway-fees
// Apura a taxa real do gateway por cobrança e grava em `payment.gateway_fee_cents`.
//
// Por que uma varredura e não o webhook: a taxa não vem na order nem na charge. O único lugar da
// Core v5 que traz é `GET /payables`, um recebível por parcela, e o recebível não existe no mesmo
// instante do `charge.paid`. Com a custódia ligada a cobrança inteira cai na Movepark, então essa
// taxa é custo nosso e sem lançamento a margem do Faturamento sai sempre maior que a real.
//
// Nulo é "ainda não apurado", não zero: cobrança sem recebível não recebe valor, só o carimbo da
// tentativa em `gateway_fee_synced_at`.
//
// Chamada interna pelo pg_cron (pg_net), protegida pelo header x-reconcile-gateway-fees-key.
//
// POST /functions/v1/reconcile-gateway-fees   (header: x-reconcile-gateway-fees-key: <chave>)
// → { ok, checked, updated }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { totalGatewayFeeCents } from "../_shared/payments/fees.ts";
import { BATCH_LIMIT, feeWindowIso } from "./logic.ts";

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

  // A chave interna vem do Vault (mesma que o cron envia), sem env var, sem sincronizar segredo.
  const { data: expected } = await admin.rpc("reconcile_gateway_fees_expected_key");
  if (!expected || req.headers.get("x-reconcile-gateway-fees-key") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  const janela = feeWindowIso(Date.now());
  const { data: payments, error } = await admin
    .from("payment")
    .select("id, provider_charge_id")
    .eq("provider", "pagarme")
    .eq("status", "paid")
    .is("gateway_fee_cents", null)
    .not("provider_charge_id", "is", null)
    .gte("paid_at", janela.since)
    .lt("paid_at", janela.until)
    .order("paid_at", { ascending: false })
    .limit(BATCH_LIMIT);
  if (error) return json({ error: error.message }, 500);

  let updated = 0;
  for (const p of payments ?? []) {
    if (!p.provider_charge_id) continue;
    try {
      const result = await gateway.listPayables(p.provider_charge_id);
      const fee = totalGatewayFeeCents(result.payables);
      // Sem recebível ainda: carimba a tentativa e deixa o valor nulo para a próxima volta.
      await admin
        .from("payment")
        .update({
          ...(fee == null ? {} : { gateway_fee_cents: fee }),
          gateway_fee_synced_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (fee != null) updated += 1;
    } catch (e) {
      console.error("[reconcile-gateway-fees] falha em", p.provider_charge_id, e);
    }
  }

  return json({ ok: true, checked: payments?.length ?? 0, updated });
});
