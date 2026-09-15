// Edge Function: /create-payout-transfer
// Repasse da Movepark ao recebedor do parceiro (E0.3.4). É o hop que faltava na custódia: com o
// split desligado a cobrança inteira cai no master, e este é o caminho pelo qual o dinheiro do
// parceiro sai de lá.
//
// Move DINHEIRO REAL. Por isso: só hub_admin, só sob clique (não existe cron chamando isto), valor
// recalculado no servidor pela RPC, pré-voo de saldo, e `Idempotency-Key` nascida no banco. A
// retentativa reusa a MESMA linha e a MESMA chave; sem isso, um timeout vira repasse duplicado.
//
// POST /functions/v1/create-payout-transfer
// Authorization: Bearer <JWT hub_admin>
// { "company_id": "uuid", "amount_cents": 7650 }
// → { ok, transfer_id, external_transfer_id, status, amount_cents, reused }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGateway, GatewayConfigError } from "../_shared/payments/index.ts";
import {
  classifyTransferResponse,
  decidePreflight,
  nuncaFoiAoGateway,
  parseTransferInput,
} from "./logic.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Autenticação necessária" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseTransferInput(body);
  if (!input) return json({ error: inputErr }, 400);

  // O pedido roda no contexto do usuário: quem checa hub_admin é a RPC, pelo auth.uid(). Fazer a
  // checagem aqui com service role deixaria o gate na Edge, e Edge é o lugar mais fácil de contornar.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );

  const { data: pedido, error: rpcErr } = await userClient.rpc("payout_transfer_request", {
    p_company_id: input.companyId,
    p_amount_cents: input.amountCents,
  });
  if (rpcErr) {
    // 42501 = não é hub_admin; o resto é regra de negócio (valor acima do devido, recebedor inapto).
    const status = rpcErr.code === "42501" ? 403 : 422;
    return json({ error: rpcErr.message }, status);
  }

  const transfer = (pedido as { reused?: boolean; transfer?: Record<string, unknown> })?.transfer;
  const reused = Boolean((pedido as { reused?: boolean })?.reused);
  if (!transfer?.id) return json({ error: "Falha ao registrar o repasse." }, 500);

  // Já foi ao gateway numa tentativa anterior: não manda de novo, só devolve o que existe.
  if (transfer.external_transfer_id) {
    return json({
      ok: true,
      reused: true,
      transfer_id: transfer.id,
      external_transfer_id: transfer.external_transfer_id,
      status: transfer.status,
      amount_cents: transfer.amount_cents,
    });
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return json({ error: e.message }, 503);
    throw e;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const amountCents = Number(transfer.amount_cents);
  const sourceId = String(transfer.source_recipient_id);
  const targetId = String(transfer.target_recipient_id);
  const linha = {
    external_transfer_id: (transfer.external_transfer_id as string | null) ?? null,
    failed_reason: (transfer.failed_reason as string | null) ?? null,
    raw: transfer.raw ?? null,
  };

  // Pré-voo: o saldo é POR RECEBEDOR (`GET /balance` da conta responde 404).
  const saldo = await gateway.getRecipientBalance(sourceId);
  const preflight = decidePreflight({ amountCents, availableCents: saldo.availableCents });
  if (!preflight.ok) {
    // A RPC já gravou a linha antes do pré-voo. Deixá-la em `created` criava um repasse fantasma:
    // contava como repassado, ocupava o índice de um em andamento e travava a empresa sem saída
    // pelo sistema (achado da varredura de 15/09/2026). Só cancela a linha que NUNCA foi ao
    // gateway; a que já tentou pode ter movido o dinheiro, e fica para retentar com a mesma chave.
    if (nuncaFoiAoGateway(linha)) {
      await admin
        .from("payout_transfer")
        .update({ status: "canceled", failed_reason: `pré-voo: ${preflight.reason}` })
        .eq("id", transfer.id)
        .eq("status", "created");
    }
    return json({ error: preflight.reason }, 409);
  }

  // Marca a tentativa ANTES de chamar o gateway. Se a Edge cair no meio da chamada, a linha já diz
  // que foi tentada, e o pré-voo seguinte não a cancela achando que ela nunca saiu.
  await admin
    .from("payout_transfer")
    .update({ raw: { tentativa_em: new Date().toISOString() } })
    .eq("id", transfer.id);

  let result;
  try {
    result = await gateway.createTransfer({
      amountCents,
      sourceRecipientId: sourceId,
      targetRecipientId: targetId,
      idempotencyKey: String(transfer.idempotency_key),
      metadata: { company_id: input.companyId, payout_transfer_id: String(transfer.id) },
    });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error("[create-payout-transfer] rede na transferência:", transfer.id, motivo);
    await admin
      .from("payout_transfer")
      .update({ failed_reason: `rede: ${motivo}`.slice(0, 500) })
      .eq("id", transfer.id);
    return json(
      { error: "Não deu para confirmar com o gateway. Tente de novo: o repasse é retomado, não duplicado." },
      502,
    );
  }

  const outcome = classifyTransferResponse({
    httpStatus: result.httpStatus,
    transferId: result.transferId,
    rawStatus: result.status,
  });

  if (outcome.kind === "rejected") {
    // Recusa processada: nada saiu, então a linha falha e a empresa fica livre para outro pedido.
    console.error("[create-payout-transfer] gateway recusou:", result.httpStatus, JSON.stringify(result.raw));
    await admin
      .from("payout_transfer")
      .update({ status: "failed", failed_reason: `recusado HTTP ${result.httpStatus}`, raw: result.raw })
      .eq("id", transfer.id);
    return json({ error: "O gateway recusou a transferência." }, 422);
  }

  if (outcome.kind === "uncertain") {
    // Pode ter saído. A linha fica em `created` com o motivo, e retentar reusa a MESMA chave.
    console.error("[create-payout-transfer] resposta incerta:", result.httpStatus, JSON.stringify(result.raw));
    await admin
      .from("payout_transfer")
      .update({ failed_reason: `incerto HTTP ${result.httpStatus}`, raw: result.raw })
      .eq("id", transfer.id);
    return json(
      { error: "O gateway não confirmou. Tente de novo: o repasse é retomado, não duplicado." },
      502,
    );
  }

  const { error: upErr } = await admin
    .from("payout_transfer")
    .update({
      external_transfer_id: result.transferId,
      status: outcome.rowStatus,
      ...(outcome.rowStatus === "paid" ? { paid_at: new Date().toISOString() } : {}),
      failed_reason: outcome.rowStatus === "failed" || outcome.rowStatus === "canceled"
        ? `gateway: ${result.status}`
        : null,
      raw: result.raw,
    })
    .eq("id", transfer.id);
  if (upErr) {
    // O dinheiro JÁ saiu. Não dá para desfazer, então o que importa é o rastro no log.
    console.error("[create-payout-transfer] repasse feito mas não gravado:", transfer.id, result.transferId, upErr.message);
  }

  return json(
    {
      ok: true,
      reused,
      transfer_id: transfer.id,
      external_transfer_id: result.transferId,
      status: outcome.rowStatus,
      amount_cents: amountCents,
    },
    201,
  );
});
