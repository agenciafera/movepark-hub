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
// Segunda porta (22/09/2026): o Manager chama com o JWT de um hub_admin e `{ booking_id }` ao abrir
// a reserva, para apurar a taxa daquela cobrança na hora, sem esperar a volta do cron (30 min) nem
// o atraso de 10 min da varredura: o recebível costuma existir segundos depois do `charge.paid`.
//
// POST /functions/v1/reconcile-gateway-fees   (header: x-reconcile-gateway-fees-key: <chave> | Authorization: Bearer <jwt hub_admin>)
// { booking_id? }   só na porta do hub_admin
// → { ok, checked, updated }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { partnerReleaseAt, totalGatewayFeeCents } from "../_shared/payments/fees.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { partnerRule } from "../_shared/payments/split.ts";
import { BATCH_LIMIT, feeRetryCutoffIso, feeWindowIso } from "./logic.ts";

// CORS porque a porta do hub_admin é chamada do navegador.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reconcile-gateway-fees-key",
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

  // A chave interna vem do Vault (mesma que o cron envia), sem env var, sem sincronizar segredo.
  const { data: expected } = await admin.rpc("reconcile_gateway_fees_expected_key");
  const pelaChave = !!expected && req.headers.get("x-reconcile-gateway-fees-key") === expected;
  if (!pelaChave && !(await ehHubAdmin(req))) {
    return json({ error: "unauthorized" }, 401);
  }
  // Uma reserva só, pedida pelo Manager: sem atraso e sem recuo entre tentativas.
  let bookingId: string | null = null;
  if (!pelaChave) {
    const body = await req.json().catch(() => null);
    bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
    if (!bookingId) return json({ error: "booking_id é obrigatório" }, 400);
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  const janela = feeWindowIso(Date.now());
  let q = admin
    .from("payment")
    .select("id, booking_id, provider_charge_id, split")
    .eq("provider", "pagarme")
    .in("status", bookingId ? ["paid", "refunded"] : ["paid"])
    // Entra quem ainda não tem a taxa OU ainda não tem a data de liberação da parte do parceiro
    // (E0.3.7): a coluna nova nasceu depois de muita cobrança já apurada.
    .or("gateway_fee_cents.is.null,partner_release_at.is.null")
    .not("provider_charge_id", "is", null);
  if (bookingId) {
    q = q.eq("booking_id", bookingId).limit(5);
  } else {
    q = q
      .gte("paid_at", janela.since)
      .lt("paid_at", janela.until)
      // Recuo: sem isto as mesmas cobranças sem recebível voltavam a cada 30 min e o resto do lote
      // morria de fome. Quem nunca foi tentado vem primeiro.
      .or(`gateway_fee_synced_at.is.null,gateway_fee_synced_at.lt.${feeRetryCutoffIso(Date.now())}`)
      .order("gateway_fee_synced_at", { ascending: true, nullsFirst: true })
      .order("paid_at", { ascending: false })
      .limit(BATCH_LIMIT);
  }
  const { data: payments, error } = await q;
  if (error) return json({ error: error.message }, 500);

  let updated = 0;
  for (const p of payments ?? []) {
    if (!p.provider_charge_id) continue;
    try {
      const result = await gateway.listPayables(p.provider_charge_id);
      const fee = totalGatewayFeeCents(result.payables);
      // Rastro do gateway (E0.3.9): o que os recebíveis disseram, com taxa e data de liberação.
      await logGatewayEvent(admin, {
        paymentId: p.id,
        bookingId: p.booking_id ?? null,
        kind: "payables",
        httpStatus: result.httpStatus,
        request: { charge_id: p.provider_charge_id },
        response: result.raw,
        note: `taxa ${fee ?? "?"} c · ${result.payables.length} recebível(is)`,
      });
      // E0.3.7: junto com a taxa, quando o gateway libera a parte do parceiro (conta do parceiro).
      const release = partnerReleaseAt(result.payables, partnerRule((p.split ?? []) as never)?.recipientId ?? null);
      // Sem recebível ainda: carimba a tentativa e deixa o valor nulo para a próxima volta.
      await admin
        .from("payment")
        .update({
          ...(fee == null ? {} : { gateway_fee_cents: fee }),
          ...(release == null ? {} : { partner_release_at: release }),
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
