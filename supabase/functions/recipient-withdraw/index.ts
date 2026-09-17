// Edge Function: /recipient-withdraw (E0.3.7, conta do parceiro)
//
// Saque do saldo do recebedor do parceiro para a conta bancária dele, pedido pela tela "Conta"
// (Manager, por empresa) ou pelo Operator (a própria). É o botão "Repassar" do extrato: não é o
// repasse da custódia (create-payout-transfer), que move dinheiro entre recebedores.
//
// POST /functions/v1/recipient-withdraw   Authorization: Bearer <JWT>
// { "company_id": "uuid", "amount_cents": 5000, "force"?: true }
// → { ok, withdrawal_id, external_transfer_id, status, requested_cents, amount_cents (vai ao banco), fee_cents }
//
// Permissão: hub_admin OU membro da empresa com `payouts:write` (o Dono, ADR-005).
// Pré-voo: lê o saldo disponível do recebedor ao vivo; só pede quando cobre. Idempotência pelo
// header do gateway; a linha em `payout_withdrawal` nasce com o id que o gateway devolveu e o
// webhook `transfer.*` (quando chega) e a conciliação atualizam o status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import { withdrawalPatch } from "../_shared/payments/withdrawal.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { sendWithdrawalEmails } from "../_shared/withdrawal-email.ts";
import { parseWithdrawInput, withdrawCap, withdrawPreflight } from "./logic.ts";

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

  // E0.3.8: o teto é o NOSSO disponível (vendas liberadas pelo prazo, menos dívida e saques),
  // calculado no banco com o saldo que acabou de ser lido.
  await admin.from("payout_recipient").update({
    balance_available_cents: saldo.availableCents ?? 0,
    balance_waiting_cents: saldo.waitingFundsCents ?? 0,
    balance_transferred_cents: saldo.transferredCents ?? 0,
    balance_synced_at: new Date().toISOString(),
  }).eq("id", recipient.id);
  const { data: teto, error: tetoErr } = await admin.rpc("payout_withdrawable", { p_company_id: input.companyId });
  if (tetoErr || !teto) return jsonResponse({ error: "Não foi possível calcular o disponível para saque." }, 500);
  const tetoJson = teto as { available_cents?: number; withdrawal_fee_cents?: number };
  const cap = withdrawCap({
    amountCents: input.amountCents,
    availableCents: Number(tetoJson.available_cents ?? 0),
    feeCents: Number(tetoJson.withdrawal_fee_cents ?? 0),
    gatewayAvailableCents: saldo.availableCents,
    isHubAdmin,
    force: input.force,
  });
  if (!cap.ok) {
    return jsonResponse(
      { error: cap.reason, available_cents: tetoJson.available_cents ?? 0, withdrawal_fee_cents: tetoJson.withdrawal_fee_cents ?? 0 },
      cap.status,
    );
  }

  // A taxa sai de dentro do valor pedido: o gateway recebe o pedido de (valor − taxa), cobra a taxa
  // do saldo, e do recebedor sai exatamente o valor que o parceiro pediu.
  const feeCents = Number(tetoJson.withdrawal_fee_cents ?? 0);
  const toBankCents = cap.toBankCents;
  const idempotencyKey = `wd-${crypto.randomUUID()}`;
  const result = await gateway.createWithdrawal({
    recipientId: recipient.external_recipient_id,
    amountCents: toBankCents,
    idempotencyKey,
    metadata: { company_id: input.companyId, requested_by: userData.user.id, requested_cents: String(input.amountCents) },
  });
  const http = result.httpStatus ?? 0;
  if (http < 200 || http >= 300 || !result.transferId) {
    console.error("[recipient-withdraw] gateway recusou:", http, JSON.stringify(result.raw));
    return jsonResponse({ error: `O gateway recusou o saque (HTTP ${http}).`, raw: result.raw }, 502);
  }

  const nowIso = new Date().toISOString();
  // E0.3.10: status, previsão de queda (do gateway, ou a regra das 15h) e leitura, pela mesma regra
  // que o webhook e a conciliação usam. A partir daqui `reconcile-payout-transfers` relê a linha a
  // cada 15 min até ela cair no banco ou falhar.
  const patch = withdrawalPatch({ result, nowIso }) ?? {};
  const status = (patch.status as string | undefined) ?? "created";
  const { data: row, error: rowErr } = await admin
    .from("payout_withdrawal")
    .upsert(
      {
        company_id: input.companyId,
        provider: "pagarme",
        external_transfer_id: result.transferId,
        external_recipient_id: recipient.external_recipient_id,
        // O que foi ao banco; a taxa fica ao lado. amount + fee = o que saiu do recebedor.
        amount_cents: toBankCents,
        fee_cents: feeCents,
        requested_at: nowIso,
        ...patch,
        status,
      },
      { onConflict: "provider,external_transfer_id" },
    )
    .select("id, company_id, amount_cents, fee_cents, status, expected_at, paid_at, failure_reason, requested_email_sent_at, settled_email_sent_at, raw")
    .maybeSingle();
  if (rowErr) console.error("[recipient-withdraw] saque pedido mas a linha não gravou:", rowErr.message);

  // Avisa o parceiro que o saque está a caminho (a conciliação avisa quando cair).
  if (row) await sendWithdrawalEmails(admin, row);

  // Rastro do gateway: o saque não tem reserva, mas a chamada fica registrada como as outras.
  await logGatewayEvent(admin, {
    paymentId: null,
    bookingId: null,
    kind: "withdrawal",
    httpStatus: result.httpStatus,
    request: { company_id: input.companyId, recipient_id: recipient.external_recipient_id, amount: toBankCents, requested_cents: input.amountCents, force: input.force },
    response: result.raw ?? null,
    note: `saque ${status} · transfer ${result.transferId}`,
  });

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
    requested_cents: input.amountCents,
    amount_cents: toBankCents,
    fee_cents: feeCents,
  });
});
