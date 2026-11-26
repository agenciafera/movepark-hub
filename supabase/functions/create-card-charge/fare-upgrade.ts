// Upgrade de tarifa pago no cartão (reunião de 26/11/2026), dentro de create-card-charge.
//
// Até aqui o upgrade só existia no PIX (Edge create-fare-upgrade). A regra é a mesma do PIX: só a
// diferença entre as tarifas, 100% Movepark (é serviço nosso, fora do split da vaga), sem downgrade
// e antes da entrada. O que muda é o meio: cartão salvo ou novo, À VISTA (decisão da reunião: o
// upgrade não parcela), pelo mesmo antifraude e com o mesmo "salvar cartão" do checkout.
//
// Só para reserva já PAGA (`confirmed`): reserva pendente ainda vai pagar no checkout, e o upgrade dela
// segue pelo PIX. Aprovado na hora: aplica o upgrade aqui (apply_fare_upgrade). Em análise: o webhook
// aplica quando virar `paid`, como no PIX. Fica num arquivo próprio para não tocar no fluxo da compra.

import {
  chargeStatusToPaymentStatus,
  getGateway,
  GatewayConfigError,
} from "../_shared/payments/index.ts";
import { effectiveSplitEnabled } from "../_shared/payments/split.ts";
import { customerTypeFor, isValidChargeDocument } from "../_shared/payments/documents.ts";
import { parseBrPhone } from "../_shared/payments/contact.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import { chargeFailureDetail, invalidCardField } from "../_shared/payments/pagarme.ts";
import { normalizeBrand } from "../_shared/payments/card-brand.ts";
import { CHARGE_IN_PROGRESS_MESSAGE, claimChargeLock } from "../_shared/payments/charge-lock.ts";
import { voidOpenPixCharges } from "../_shared/payments/open-pix.ts";
import { checkBookingUpgradable, checkUpgradeDelta } from "../create-fare-upgrade/logic.ts";
import {
  ANTIFRAUD_MESSAGE,
  ANTIFRAUD_NOTE,
  ANTIFRAUD_RETRY_LIMIT,
  buildFareUpgradeItems,
  type CardInput,
  cardFieldMessage,
  clientIp,
  extractCardId,
} from "./logic.ts";

export interface FareUpgradeBooking {
  id: string;
  code: string;
  status: string;
  check_in_at: string;
  fare_tier: string | null;
  fare_price_cents: number | null;
  profile_id: string;
  location_id: string;
  customer_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_tax_id: string | null;
}

interface Ctx {
  // deno-lint-ignore no-explicit-any
  admin: any;
  req: Request;
  userId: string;
  booking: FareUpgradeBooking;
  input: CardInput & { fareUpgrade: NonNullable<CardInput["fareUpgrade"]> };
  lock: { release?: () => Promise<void> };
  /** Recusa com rastro na reserva (kind `charge_rejected`), a mesma do fluxo da compra. */
  recusar: (status: number, error: string, extra?: { response?: unknown; code?: string }) => Promise<Response>;
  jsonResponse: (body: unknown, status?: number) => Response;
}

export async function chargeFareUpgradeByCard(ctx: Ctx): Promise<Response> {
  const { admin, booking, input, recusar, jsonResponse } = ctx;
  const up = input.fareUpgrade;

  // 1. Reserva paga, antes da entrada, tarifa-alvo acima da atual (mesmos gates do PIX).
  if (booking.status !== "confirmed") {
    return await recusar(400, "O upgrade no cartão é para reserva já paga. Use o PIX.");
  }
  const negado = checkBookingUpgradable({
    booking,
    userId: ctx.userId,
    targetTier: up.targetTier,
    now: new Date(),
  });
  if (negado) return await recusar(negado.status, negado.error);

  // 2. A diferença pelo catálogo de hoje, conferida com a que o cliente viu na tabela.
  const { data: targetFare } = await admin
    .from("fare")
    .select("price_cents, label")
    .eq("tier", up.targetTier)
    .eq("is_active", true)
    .maybeSingle();
  const semDelta = checkUpgradeDelta({
    targetPriceCents: targetFare?.price_cents ?? null,
    currentFarePriceCents: booking.fare_price_cents,
  });
  if (semDelta) return await recusar(semDelta.status, semDelta.error);
  const deltaCents = targetFare!.price_cents - (booking.fare_price_cents ?? 0);
  if (deltaCents !== up.expectedDeltaCents) {
    return await recusar(409, "O valor do upgrade mudou. Confira o novo valor antes de pagar.", { code: "quote_changed" });
  }

  // 3. Trava de cobrança: dois cliques não viram duas cobranças.
  const trava = await claimChargeLock(admin, booking.id);
  if (!trava.acquired) return await recusar(409, CHARGE_IN_PROGRESS_MESSAGE, { code: "charge_in_progress" });
  ctx.lock.release = trava.release;

  // 4. Recebedor master (a receita do upgrade é 100% Movepark) e a chave do split da empresa.
  const { data: settings } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", ["pagarme_movepark_recipient_id", "pagarme_split_enabled", "card_installment_policy"]);
  const settingMap = Object.fromEntries(
    ((settings ?? []) as { key: string; value: string | null }[]).map((s) => [s.key, s.value]),
  );
  const moveparkRecipientId = (settingMap.pagarme_movepark_recipient_id ?? "").trim();
  if (!moveparkRecipientId) return await recusar(503, "Recebedor master da Movepark não configurado.");
  const { data: locSplit } = await admin
    .from("location")
    .select("company:company_id(gateway_split_enabled)")
    .eq("id", booking.location_id)
    .maybeSingle();
  const companySplit = (locSplit?.company as { gateway_split_enabled?: boolean } | null)?.gateway_split_enabled ?? false;
  const splitEnabled = effectiveSplitEnabled(settingMap.pagarme_split_enabled, companySplit);
  const split = [
    {
      recipientId: moveparkRecipientId,
      amount: deltaCents,
      type: "flat" as const,
      liable: true,
      chargeProcessingFee: true,
      chargeRemainderFee: true,
    },
  ];

  // 5. Pagador: do snapshot da reserva, como no PIX do upgrade e no checkout.
  const payerName =
    [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim() ||
    booking.customer_name ||
    "Cliente Movepark";
  const { data: authUser } = await admin.auth.admin.getUserById(booking.profile_id);
  const email = booking.customer_email ?? authUser?.user?.email ?? null;
  if (!email) return await recusar(422, "Cliente sem e-mail para a cobrança.");
  if (!isValidChargeDocument(booking.customer_tax_id)) {
    return await recusar(422, "Cliente sem CPF/CNPJ válido para a cobrança.");
  }
  const phone = parseBrPhone(booking.customer_phone);
  if (!phone) return await recusar(422, "Cliente sem telefone (com DDD) para a cobrança.");

  // 6. Cartão salvo (do próprio cliente) ou novo (token de uso único).
  let cardRef: { cardToken?: string; cardId?: string };
  if (input.paymentMethodId) {
    const { data: pm } = await admin
      .from("payment_method")
      .select("provider_token")
      .eq("id", input.paymentMethodId)
      .eq("profile_id", booking.profile_id)
      .eq("provider", "pagarme")
      .is("deleted_at", null)
      .maybeSingle();
    if (!pm?.provider_token) return await recusar(404, "Cartão salvo não encontrado.");
    cardRef = { cardId: pm.provider_token };
  } else {
    cardRef = { cardToken: input.cardToken! };
  }

  // 7. Depois do limite de reprovações do antifraude, o cartão não vai mais ao gateway.
  const { count: reprovacoes } = await admin
    .from("payment_gateway_event")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id)
    .eq("kind", "charge_failed")
    .eq("note", ANTIFRAUD_NOTE);
  if ((reprovacoes ?? 0) >= ANTIFRAUD_RETRY_LIMIT) {
    return await recusar(402, ANTIFRAUD_MESSAGE, { code: "antifraud_limit" });
  }

  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return await recusar(503, e.message);
    throw e;
  }

  // 8. Cobrança à vista, 1 parcela, sem juros.
  const result = await gateway.createCardCharge({
    externalCode: `${booking.code}-UP-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
    amountCents: deltaCents,
    customer: {
      name: payerName,
      email,
      document: booking.customer_tax_id ?? null,
      type: customerTypeFor(booking.customer_tax_id),
      phone,
    },
    items: buildFareUpgradeItems(booking.code, targetFare!.label, deltaCents),
    // Com a custódia ligada o gateway não recebe split: o valor cai inteiro na Movepark.
    split: splitEnabled ? split : undefined,
    card: cardRef,
    billingAddress: input.billingAddress ?? undefined,
    ip: clientIp(ctx.req.headers) ?? undefined,
    installments: 1,
    metadata: { booking_id: booking.id, booking_code: booking.code, kind: "fare_upgrade" },
  });

  const base = {
    booking_id: booking.id,
    provider: "pagarme",
    method: "card",
    kind: "fare_upgrade",
    fare_target_tier: up.targetTier,
    provider_payment_id: result.orderId,
    provider_charge_id: result.chargeId,
    amount: deltaCents / 100,
    installments: 1,
    split,
    split_sent_to_gateway: splitEnabled,
  };

  if (result.status === "failed") {
    await admin.from("payment").insert({ id: crypto.randomUUID(), ...base, status: "failed" });
    const detalhe = chargeFailureDetail(result.raw);
    await logGatewayEvent(admin, {
      paymentId: null,
      bookingId: booking.id,
      kind: "charge_failed",
      httpStatus: result.httpStatus,
      request: { method: "card", kind: "fare_upgrade", amount_cents: deltaCents, installments: 1 },
      response: result.raw,
      note: detalhe.integrationError
        ? `erro de integração (${detalhe.code}): ${detalhe.messages.join("; ") || "sem mensagem"}`
        : detalhe.antifraudReproved
          ? ANTIFRAUD_NOTE
          : `cartão recusado pelo emissor${detalhe.code ? ` (${detalhe.code})` : ""}`,
    });
    if (detalhe.integrationError) {
      const campo = invalidCardField(detalhe.messages);
      if (campo) return jsonResponse({ error: cardFieldMessage(campo), code: "card_data_invalid" }, 402);
      return jsonResponse({ error: "Não conseguimos processar o pagamento agora. Tente de novo em alguns minutos." }, 502);
    }
    if (detalhe.antifraudReproved) return jsonResponse({ error: ANTIFRAUD_MESSAGE, code: "antifraud_reproved" }, 402);
    return jsonResponse({ error: "Cartão recusado. Tente outro cartão." }, 402);
  }
  if (!result.orderId || (result.httpStatus ?? 500) >= 400) {
    console.error("[create-card-charge] upgrade no cartão falhou:", result.httpStatus, JSON.stringify(result.raw));
    return await recusar(502, "Falha ao processar o cartão.", { response: result.raw });
  }

  // 9. Grava a cobrança (paga na hora ou em análise, que o webhook confirma).
  const paymentId = crypto.randomUUID();
  const { error: payErr } = await admin
    .from("payment")
    .insert({ id: paymentId, ...base, status: chargeStatusToPaymentStatus(result.status) });
  if (payErr) return await recusar(500, payErr.message);
  await logGatewayEvent(admin, {
    paymentId,
    bookingId: booking.id,
    kind: "charge_created",
    httpStatus: result.httpStatus,
    request: { method: "card", kind: "fare_upgrade", amount_cents: deltaCents, installments: 1, split: splitEnabled ? split : null },
    response: result.raw,
  });

  // 10. Aprovado: o PIX do upgrade que ficou aberto sai (o cliente não paga duas vezes) e a tarifa
  // sobe agora. O `charge.paid` do webhook chega depois e vira noop (apply_fare_upgrade é idempotente).
  let applied = false;
  if (result.status === "paid" || result.status === "authorized") {
    await voidOpenPixCharges(admin, gateway, booking.id, {
      kind: "fare_upgrade",
      note: "PIX do upgrade anulado: o upgrade foi pago no cartão",
    });
  }
  if (result.status === "paid") {
    const { data: upRes, error: upErr } = await admin.rpc("apply_fare_upgrade", {
      p_booking_id: booking.id,
      p_target_tier: up.targetTier,
    });
    if (upErr) {
      console.error("[create-card-charge] apply_fare_upgrade falhou:", upErr.message);
    } else if ((upRes as { upgraded?: boolean } | null)?.upgraded) {
      applied = true;
      const delta = (upRes as { delta?: number }).delta;
      const { error: logErr } = await admin.rpc("log_booking_modification", {
        p_booking_id: booking.id,
        p_type: "fare_upgrade",
        p_actor_id: ctx.userId,
        p_actor_role: "customer",
        p_changes: { to: { fare_tier: up.targetTier }, method: "card" },
        p_amount_delta_cents: delta == null ? deltaCents : Math.round(Number(delta) * 100),
        p_reason: null,
      });
      if (logErr) console.error("[create-card-charge] log do upgrade falhou:", logErr.message);
    }
  }

  // 11. Salvar o cartão (opt-in): só token, bandeira e final, nunca o número.
  let savedCard = false;
  if (input.saveCard && input.cardToken) {
    const cardId = extractCardId(result.raw);
    if (cardId) {
      const { error: pmErr } = await admin.from("payment_method").insert({
        profile_id: booking.profile_id,
        provider: "pagarme",
        provider_token: cardId,
        brand: normalizeBrand(input.card.brand),
        last4: input.card.last4 ?? "0000",
        holder_name: input.card.holderName,
        expiry_month: input.card.expMonth,
        expiry_year: input.card.expYear,
      });
      savedCard = !pmErr;
    }
  }

  return jsonResponse(
    {
      payment_id: paymentId,
      status: result.status,
      installments: 1,
      charged_amount: deltaCents / 100,
      interest_amount: 0,
      saved_card: savedCard,
      fare_upgrade: true,
      applied,
    },
    201,
  );
}
