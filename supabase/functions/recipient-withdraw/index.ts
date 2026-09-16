// Edge Function: /recipient-withdraw (E0.3.7, conta do parceiro)
//
// Saque do saldo do recebedor do parceiro para a conta bancária dele, pedido pela tela "Conta"
// (Manager, por empresa) ou pelo Operator (a própria). É o botão "Repassar" do extrato: não é o
// repasse da custódia (create-payout-transfer), que move dinheiro entre recebedores.
//
// POST /functions/v1/recipient-withdraw   Authorization: Bearer <JWT>
// { "company_id": "uuid", "amount_cents": 5000 }
// → { ok, withdrawal_id, external_transfer_id, status, amount_cents, fee_cents }
//
// Permissão: hub_admin OU membro da empresa com `payouts:write` (o Dono, ADR-005).
// Pré-voo: lê o saldo disponível do recebedor ao vivo; só pede quando cobre. Idempotência pelo
// header do gateway; a linha em `payout_withdrawal` nasce com o id que o gateway devolveu e o
// webhook `transfer.*` (quando chega) e a conciliação atualizam o status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { transferStatusToWithdrawalStatus } from "../pagarme-webhook/logic.ts";
import { parseWithdrawInput, withdrawPreflight } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Autenticação necessária" }, 401);

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseWithdrawInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const { data: caller } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  const isHubAdmin = caller?.role === "hub_admin";
  if (!isHubAdmin) {
    const { data: allowed } = await userClient.rpc("member_has_scope", {
      p_company_id: input.companyId,
      p_scope: "payouts:write",
    });
    if (!allowed) return jsonResponse({ error: "Sem permissão para sacar por esta empresa." }, 403);
  }

  const { data: recipient } = await admin
    .from("payout_recipient")
    .select("id, external_recipient_id, status, gateway_missing_at")
    .eq("company_id", input.companyId)
    .eq("provider", "pagarme")
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipient?.external_recipient_id || recipient.status !== "active") {
    return jsonResponse({ error: "A empresa não tem recebedor ativo no gateway." }, 409);
  }
  if (recipient.gateway_missing_at) {
    return jsonResponse({ error: "O recebedor não existe no gateway; o saque morreria em 404." }, 409);
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return jsonResponse({ error: e.message }, 503);
    throw e;
  }

  const saldo = await gateway.getRecipientBalance(recipient.external_recipient_id);
  const pre = withdrawPreflight(saldo, input.amountCents);
  if (!pre.ok) return jsonResponse({ error: pre.reason, available_cents: saldo.availableCents }, pre.status);

  const idempotencyKey = `wd-${crypto.randomUUID()}`;
  const result = await gateway.createWithdrawal({
    recipientId: recipient.external_recipient_id,
    amountCents: input.amountCents,
    idempotencyKey,
    metadata: { company_id: input.companyId, requested_by: userData.user.id },
  });
  const http = result.httpStatus ?? 0;
  if (http < 200 || http >= 300 || !result.transferId) {
    console.error("[recipient-withdraw] gateway recusou:", http, JSON.stringify(result.raw));
    return jsonResponse({ error: `O gateway recusou o saque (HTTP ${http}).`, raw: result.raw }, 502);
  }

  // Taxa de saque configurada (a mesma que o webhook usa).
  const { data: feeSetting } = await admin.from("app_setting").select("value").eq("key", "payout_withdrawal_fee_cents").maybeSingle();
  const feeCents = Number(feeSetting?.value ?? 0) || 0;
  const status = transferStatusToWithdrawalStatus(result.status);
  const nowIso = new Date().toISOString();
  const { data: row, error: rowErr } = await admin
    .from("payout_withdrawal")
    .upsert(
      {
        company_id: input.companyId,
        provider: "pagarme",
        external_transfer_id: result.transferId,
        external_recipient_id: recipient.external_recipient_id,
        amount_cents: input.amountCents,
        fee_cents: feeCents,
        status,
        requested_at: nowIso,
        ...(status === "paid" ? { paid_at: nowIso } : {}),
        raw: result.raw ?? null,
      },
      { onConflict: "provider,external_transfer_id" },
    )
    .select("id")
    .maybeSingle();
  if (rowErr) console.error("[recipient-withdraw] saque pedido mas a linha não gravou:", rowErr.message);

  // O saldo mudou: relê e grava, para a tela não mostrar o número de antes do saque.
  try {
    const depois = await gateway.getRecipientBalance(recipient.external_recipient_id);
    if ((depois.httpStatus ?? 0) >= 200 && (depois.httpStatus ?? 0) < 300 && depois.availableCents != null) {
      await admin.from("payout_recipient").update({
        balance_available_cents: depois.availableCents,
        balance_waiting_cents: depois.waitingFundsCents ?? 0,
        balance_transferred_cents: depois.transferredCents ?? 0,
        balance_synced_at: new Date().toISOString(),
      }).eq("id", recipient.id);
    }
  } catch (e) {
    console.error("[recipient-withdraw] releitura do saldo falhou:", e);
  }

  return jsonResponse({
    ok: true,
    withdrawal_id: row?.id ?? null,
    external_transfer_id: result.transferId,
    status,
    amount_cents: input.amountCents,
    fee_cents: feeCents,
  });
});
