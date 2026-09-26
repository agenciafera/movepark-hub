// Saque do recebedor para o banco, o mesmo para o botão Repassar (recipient-withdraw) e para o
// repasse automático (payout-auto-run). Spec: docs/specs/repasse-automatico-mensal.md.
//
// Pré-voo no saldo real, teto no NOSSO disponível (payout_withdrawable), pedido ao gateway com
// Idempotency-Key, linha em payout_withdrawal (origem e quem paga a taxa), e-mails, rastro e
// releitura do saldo. Nunca lança por erro de negócio: devolve { ok: false, status, error }.

import type { PaymentGateway } from "./types.ts";
import { withdrawalPatch } from "./withdrawal.ts";
import { logGatewayEvent } from "./trail.ts";
import { sendWithdrawalEmails } from "../withdrawal-email.ts";
import { withdrawCap, withdrawPreflight } from "./withdraw-logic.ts";

export interface PerformWithdrawalArgs {
  companyId: string;
  amountCents: number;
  force: boolean;
  isHubAdmin: boolean;
  requestedBy: string;
  origin: "manual" | "automatic";
  feeBorneBy: "partner" | "movepark";
  cycleId?: string | null;
}

export type PerformWithdrawalResult =
  | { ok: true; withdrawal_id: string | null; external_transfer_id: string; status: string; requested_cents: number; amount_cents: number; fee_cents: number }
  | { ok: false; status: number; error: string; available_cents?: number; withdrawal_fee_cents?: number; raw?: unknown };

// deno-lint-ignore no-explicit-any
export async function performWithdrawal(admin: any, gateway: PaymentGateway, args: PerformWithdrawalArgs): Promise<PerformWithdrawalResult> {
  const { data: recipient } = await admin
    .from("payout_recipient")
    .select("id, external_recipient_id, status, gateway_missing_at")
    .eq("company_id", args.companyId)
    .eq("provider", "pagarme")
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipient?.external_recipient_id || recipient.status !== "active") {
    return { ok: false, status: 409, error: "A empresa não tem recebedor ativo no gateway." };
  }
  if (recipient.gateway_missing_at) {
    return { ok: false, status: 409, error: "O recebedor não existe no gateway; o saque morreria em 404." };
  }

  const saldo = await gateway.getRecipientBalance(recipient.external_recipient_id);
  const pre = withdrawPreflight(saldo, args.amountCents);
  if (!pre.ok) return { ok: false, status: pre.status, error: pre.reason, available_cents: saldo.availableCents ?? undefined };

  await admin.from("payout_recipient").update({
    balance_available_cents: saldo.availableCents ?? 0,
    balance_waiting_cents: saldo.waitingFundsCents ?? 0,
    balance_transferred_cents: saldo.transferredCents ?? 0,
    balance_synced_at: new Date().toISOString(),
  }).eq("id", recipient.id);
  const { data: teto, error: tetoErr } = await admin.rpc("payout_withdrawable", { p_company_id: args.companyId });
  if (tetoErr || !teto) return { ok: false, status: 500, error: "Não foi possível calcular o disponível para saque." };
  const tetoJson = teto as { available_cents?: number; withdrawal_fee_cents?: number };
  const feeCents = Number(tetoJson.withdrawal_fee_cents ?? 0);
  const cap = withdrawCap({
    amountCents: args.amountCents,
    availableCents: Number(tetoJson.available_cents ?? 0),
    feeCents,
    gatewayAvailableCents: saldo.availableCents,
    isHubAdmin: args.isHubAdmin,
    force: args.force,
  });
  if (!cap.ok) {
    return { ok: false, status: cap.status, error: cap.reason, available_cents: Number(tetoJson.available_cents ?? 0), withdrawal_fee_cents: feeCents };
  }

  const toBankCents = cap.toBankCents;
  const idempotencyKey = `wd-${crypto.randomUUID()}`;
  const result = await gateway.createWithdrawal({
    recipientId: recipient.external_recipient_id,
    amountCents: toBankCents,
    idempotencyKey,
    metadata: { company_id: args.companyId, requested_by: args.requestedBy, requested_cents: String(args.amountCents), origin: args.origin },
  });
  const http = result.httpStatus ?? 0;
  if (http < 200 || http >= 300 || !result.transferId) {
    console.error("[performWithdrawal] gateway recusou:", http, JSON.stringify(result.raw));
    return { ok: false, status: 502, error: `O gateway recusou o saque (HTTP ${http}).`, raw: result.raw };
  }

  const nowIso = new Date().toISOString();
  const patch = withdrawalPatch({ result, nowIso }) ?? {};
  const status = (patch.status as string | undefined) ?? "created";
  const { data: row, error: rowErr } = await admin
    .from("payout_withdrawal")
    .upsert(
      {
        company_id: args.companyId,
        provider: "pagarme",
        external_transfer_id: result.transferId,
        external_recipient_id: recipient.external_recipient_id,
        amount_cents: toBankCents,
        fee_cents: feeCents,
        origin: args.origin,
        fee_borne_by: args.feeBorneBy,
        cycle_id: args.cycleId ?? null,
        requested_at: nowIso,
        ...patch,
        status,
      },
      { onConflict: "provider,external_transfer_id" },
    )
    .select("id, company_id, amount_cents, fee_cents, status, expected_at, paid_at, failure_reason, requested_email_sent_at, settled_email_sent_at, raw, origin, fee_borne_by")
    .maybeSingle();
  if (rowErr) console.error("[performWithdrawal] saque pedido mas a linha não gravou:", rowErr.message);
  if (row) await sendWithdrawalEmails(admin, row);

  await logGatewayEvent(admin, {
    paymentId: null,
    bookingId: null,
    kind: args.origin === "automatic" ? "withdrawal:automatic" : "withdrawal",
    httpStatus: result.httpStatus,
    request: { company_id: args.companyId, recipient_id: recipient.external_recipient_id, amount: toBankCents, requested_cents: args.amountCents, force: args.force, origin: args.origin, fee_borne_by: args.feeBorneBy },
    response: result.raw ?? null,
    note: `saque ${status} · transfer ${result.transferId}`,
  });

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
    console.error("[performWithdrawal] releitura do saldo falhou:", e);
  }

  return {
    ok: true,
    withdrawal_id: row?.id ?? null,
    external_transfer_id: result.transferId,
    status,
    requested_cents: args.amountCents,
    amount_cents: toBankCents,
    fee_cents: feeCents,
  };
}
