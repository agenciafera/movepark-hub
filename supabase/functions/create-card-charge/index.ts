// Edge Function: /create-card-charge
// Cria uma cobrança com CARTÃO de crédito (parcelado) + SPLIT (E0.1.3, ADR-004) para uma reserva.
// Server-authoritative: a parcela escolhida é revalidada contra a política (app_setting,
// card_installment_policy) e o valor financiado é RECALCULADO aqui — o cliente nunca informa o valor.
// O parcelamento congelado na reserva (regra de repasse > padrão da empresa) vai por cima da política
// da plataforma: máximo de parcelas e até quantas sem juros (09/11/2026).
// Tokenização é client-side (nunca trafega o PAN). Confirmação chega pela Edge `pagarme-webhook`.
//
// Diferença de troca de datas (17/11/2026): com `date_change`, cobra a diferença de uma reserva PAGA
// pela tabela da compra (RPC reprice_booking_dates), pelo MESMO caminho de split, antifraude e
// cartão salvo do checkout. A diferença é da vaga: divide como a reserva. Segura a vaga nova antes da
// cobrança, aplica na hora se aprovou (ou no webhook, se ficou em análise) e solta a vaga se recusou.
// Ver docs/specs/booking-modifications.md §8.
//
// POST /functions/v1/create-card-charge
// Authorization: Bearer <JWT>
// { booking_code, card_token? | payment_method_id?, installments, save_card?, holder_name?, brand?, last4?, exp_month?, exp_year?, billing_address? (obrigatório com card_token),
//   date_change?: { check_in_at, check_out_at, expected_delta_cents },
//   fare_upgrade?: { target_tier: "flex" | "superflex", expected_delta_cents } }
//
// Upgrade de tarifa no cartão (26/11/2026): com `fare_upgrade`, cobra à vista (installments = 1) só a
// diferença entre as tarifas, 100% Movepark, de reserva já paga. Fluxo próprio em ./fare-upgrade.ts.
//
// Resposta (201): { payment_id, status, installments, charged_amount, interest_amount, saved_card }
//
// Gateway sem resposta (5xx, timeout, rede; 26/11/2026, MP-F00991): procura o pedido pelo código e,
// se achou, segue normal. Se não achou, grava o pagamento pendente sem ids e responde
// 202 { payment_id, status: "unconfirmed", message }: o cartão pode ter sido cobrado, então o
// cliente NÃO é mandado tentar de novo, e nova cobrança da reserva fica bloqueada (409
// `charge_unconfirmed`) até o webhook ou o prazo. Ver _shared/payments/unconfirmed.ts.

const EDGE_NAME = "create-card-charge";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSplit,
  chargeStatusToPaymentStatus,
  getGateway,
  GatewayConfigError,
  isGatewaySplitEnabled,
  pixExpiresInSeconds,
} from "../_shared/payments/index.ts";
import { appliedAnticipationCompCents, appliedFeeCreditCents, debtFloorCents, effectiveSplitEnabled, maxDebtRecoveryCents, partnerRule, splitForGateway } from "../_shared/payments/split.ts";
import {
  estimateAnticipationCompCents,
  estimatePartnerAnticipationFeeCents,
} from "../_shared/payments/anticipation.ts";
import {
  applyInstallmentOverride,
  computeInstallmentPlan,
  parseInstallmentPolicy,
} from "../_shared/payments/installments.ts";
import {
  ANTIFRAUD_MESSAGE,
  ANTIFRAUD_NOTE,
  ANTIFRAUD_RETRY_LIMIT,
  buildCardItems,
  buildDateChangeItems,
  cardFieldMessage,
  clientIp,
  extractCardId,
  parseCardInput,
  reaisToCents,
} from "./logic.ts";
import { customerTypeFor, isValidChargeDocument } from "../_shared/payments/documents.ts";
import { parseBrPhone } from "../_shared/payments/contact.ts";
import { logGatewayEvent } from "../_shared/payments/trail.ts";
import {
  type BookingCommissionColumns,
  columnsFromRpc,
  commissionForCharge,
  needsCommissionFreeze,
} from "../_shared/payments/commission.ts";
import { chargeFailureDetail, invalidCardField } from "../_shared/payments/pagarme.ts";
import { normalizeBrand } from "../_shared/payments/card-brand.ts";
import { CHARGE_IN_PROGRESS_MESSAGE, claimChargeLock } from "../_shared/payments/charge-lock.ts";
import { voidOpenPixCharges } from "../_shared/payments/open-pix.ts";
import { alertIfDuplicatePayment } from "../_shared/payments/duplicate.ts";
import {
  cancelPendingDateChanges,
  chargeSplitBase,
  type DateChangeQuote,
  notifyDatesChanged,
} from "../_shared/payments/date-change.ts";
import { chargeFareUpgradeByCard, type FareUpgradeBooking } from "./fare-upgrade.ts";
import {
  findInFlightUnconfirmed,
  isUnknownGatewayOutcome,
  recoverOrder,
  UNCONFIRMED_CHARGE_MESSAGE,
  UNCONFIRMED_IN_FLIGHT_MESSAGE,
  unconfirmedExpiresAt,
} from "../_shared/payments/unconfirmed.ts";

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

/**
 * Quanto do desconto a Movepark banca nesta reserva (E3.3).
 *
 * `price_breakdown.coupon.funded_by = 'platform'` significa campanha da Movepark: o parceiro tem
 * que receber como se o cupom não existisse, então o valor volta para a base do repasse e sai da
 * nossa comissão. Cupom do parceiro devolve 0 e o split fica igual ao de sempre.
 */
function platformFundedCents(priceBreakdown: unknown): number {
  const bd = priceBreakdown as { coupon?: { discount?: number; funded_by?: string } } | null;
  const c = bd?.coupon;
  if (!c || c.funded_by !== "platform") return 0;
  return Math.max(0, Math.round(Number(c.discount ?? 0) * 100));
}

/** Onde o handler pendura a trava de cobrança, para o `finally` do Deno.serve soltar. */
interface LockSlot {
  release?: () => Promise<void>;
}

async function handle(req: Request, lock: LockSlot): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação necessária" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseCardInput(body);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1. Reserva (pertence ao usuário, pendente, não expirada)
  const { data: booking } = await admin
    .from("booking")
    .select(
      "id, code, status, total_amount, fare_tier, fare_price_cents, expires_at, profile_id, location_id, check_in_at, fare_benefits, " +
        "price_breakdown, " +
        "commission_rule_id, commission_channel, commission_take_rate_bps, commission_fee_payer, commission_chargeback_bearer, " +
        "commission_installments_max, commission_installments_interest_free, commission_anticipation_payer, " +
        "customer_name, customer_first_name, customer_last_name, customer_email, customer_phone, customer_tax_id",
    )
    .eq("code", input.bookingCode)
    .maybeSingle();
  if (!booking) return jsonResponse({ error: "Reserva não encontrada" }, 404);
  if (booking.profile_id !== userData.user.id) {
    return jsonResponse({ error: "Reserva não pertence a você" }, 403);
  }

  // Toda recusa daqui para baixo deixa rastro na reserva (kind `charge_rejected`): erro devolvido
  // antes do gateway não aparecia em lugar nenhum além do log da Edge, e foi assim que o cartão
  // ficou quebrado de 23/09 a 05/10 sem ninguém ver.
  const recusar = async (status: number, error: string, extra?: { response?: unknown; code?: string }) => {
    await logGatewayEvent(admin, {
      paymentId: null,
      bookingId: (booking as unknown as { id: string }).id,
      kind: "charge_rejected",
      httpStatus: status,
      request: { method: "card", installments: input.installments, saved_card: Boolean(input.paymentMethodId) },
      response: extra?.response ?? null,
      note: error,
    });
    return jsonResponse(extra?.code ? { error, code: extra.code } : { error }, status);
  };
  if (input.fareUpgrade) {
    return await chargeFareUpgradeByCard({
      admin,
      req,
      userId: userData.user.id,
      booking: booking as unknown as FareUpgradeBooking,
      input: { ...input, fareUpgrade: input.fareUpgrade },
      lock,
      recusar,
      jsonResponse,
    });
  }
  const dc = input.dateChange;
  if (dc) {
    // Diferença de troca de datas: reserva paga, antes da entrada, tarifa que permite alterar.
    if (booking.status !== "confirmed") return await recusar(400, "A troca de datas com cobrança é para reserva paga.");
    if (new Date(booking.check_in_at) <= new Date()) return await recusar(400, "A reserva já começou.");
    if ((booking.fare_benefits as Record<string, unknown> | null)?.date_change !== true) {
      return await recusar(403, "Sua Tarifa não permite alterar datas. Faça upgrade para Flex ou Superflex.");
    }
  } else {
    if (booking.status !== "pending") {
      return await recusar(400, `Reserva já está ${booking.status}`);
    }
    if (booking.expires_at && new Date(booking.expires_at) < new Date()) {
      return await recusar(400, "Reserva expirada");
    }

    // 1a. Gate de conformidade (RFN005/LGPD): sem aceite explícito dos Termos, não cobra.
    const { count: termsCount } = await admin
      .from("terms_acceptance")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id);
    if (!termsCount) {
      return await recusar(422, "É necessário aceitar os Termos de Uso antes de pagar.");
    }
  }

  // 1a'. Trava de cobrança (MP-07DAE9, 17/10/2026): dois cliques viraram duas cobranças porque a
  // checagem abaixo é consulta seguida de cobrança. Com a trava, a checagem e a cobrança acontecem
  // uma reserva por vez; a segunda chamada simultânea é recusada aqui.
  const trava = await claimChargeLock(admin, booking.id);
  if (!trava.acquired) {
    return await recusar(409, CHARGE_IN_PROGRESS_MESSAGE, { code: "charge_in_progress" });
  }
  lock.release = trava.release;

  // 1b. Idempotência: não cobrar de novo se já há pagamento aprovado/autorizado. (Na troca de datas a
  // reserva JÁ está paga; a trava de cobrança acima é que impede o clique duplo.)
  if (!dc) {
    const { data: paid } = await admin
      .from("payment")
      .select("id")
      .eq("booking_id", booking.id)
      .in("status", ["paid", "authorized"])
      .limit(1)
      .maybeSingle();
    if (paid) return await recusar(409, "Esta reserva já foi paga.");
    // Cartão anterior sem resposta do gateway (MP-F00991): pode ter cobrado. Cobrar de novo agora é
    // o que fez o cliente pagar duas vezes em 25/11/2026.
    if (await findInFlightUnconfirmed(admin, booking.id)) {
      return await recusar(409, UNCONFIRMED_IN_FLIGHT_MESSAGE, { code: "charge_unconfirmed" });
    }
  }

  // 2. Empresa + take_rate + recebedor do parceiro
  const { data: location } = await admin
    .from("location")
    .select("company_id")
    .eq("id", booking.location_id)
    .maybeSingle();
  if (!location) return await recusar(404, "Unidade não encontrada");

  const { data: company } = await admin
    .from("company")
    .select("take_rate_bps, gateway_split_enabled")
    .eq("id", location.company_id)
    .maybeSingle();

  const { data: recipient } = await admin
    .from("payout_recipient")
    .select("external_recipient_id, status, gateway_missing_at, anticipation_enabled")
    .eq("company_id", location.company_id)
    .eq("provider", "pagarme")
    .is("deleted_at", null)
    .maybeSingle();
  // 3. Recebedor master da Movepark + política de parcelamento (Manager)
  const { data: settings } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", [
      "pagarme_movepark_recipient_id",
      "card_installment_policy",
      "pagarme_split_enabled",
      "card_anticipation_rate_monthly_bps",
      "card_anticipation_margin_days",
      "payout_anticipation_enabled",
    ]);
  const settingMap = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  const moveparkRecipientId = (settingMap.pagarme_movepark_recipient_id ?? "").trim();
  // Global ligada OU empresa marcada (E0.3.5): a transição é por empresa, quem não tem recebedor
  // segue em custódia e não para de vender.
  const splitEnabled = effectiveSplitEnabled(
    settingMap.pagarme_split_enabled,
    company?.gateway_split_enabled,
  );

  // Com a custódia ligada o split NÃO vai ao gateway e a cobrança cai inteira na conta da Movepark,
  // então o recebedor do parceiro não é pré-requisito para VENDER. Ele só faz falta na hora do
  // repasse, e lá a RPC `payout_transfer_request` exige que esteja `active`. Exigir aqui recusava
  // com 409 uma venda que o gateway aceita, e reamarrava "publicar no catálogo" a "estar apto a
  // receber", que o E1.9 separou de propósito (o parceiro publica antes do KYC).
  // Recebedor que o gateway não reconhece (`gateway_missing_at`) conta como ausente: a cobrança
  // com split apontando para ele falharia na venda (decisão 5 do E0.3.5: bloqueia).
  if (splitEnabled && (!recipient?.external_recipient_id || recipient.gateway_missing_at || recipient.status !== "active")) {
    return await recusar(409, "O estacionamento ainda não tem recebedor ativo no gateway.");
  }

  const platformPolicy = parseInstallmentPolicy(settingMap.card_installment_policy);
  if (!platformPolicy.enabled) return await recusar(422, "Pagamento com cartão indisponível.");

  // Comissão por origem (E0.3.12): o pacote foi congelado na reserva quando ela nasceu. Reserva
  // sem pacote (criada por MCP/API, ou cujo congelamento falhou) é congelada AGORA, antes do split,
  // pela mesma função do banco, para nunca cobrar 20% de uma venda que o parceiro trouxe. Vem antes
  // das parcelas porque o pacote também decide o parcelamento (09/11/2026).
  let commissionCols = booking as unknown as BookingCommissionColumns;
  if (needsCommissionFreeze(commissionCols)) {
    const { data: frozen, error: freezeErr } = await admin.rpc("booking_apply_commission", {
      p_booking_id: (booking as unknown as { id: string }).id,
    });
    if (freezeErr) console.error("[%s] booking_apply_commission falhou:", EDGE_NAME, freezeErr.message);
    else commissionCols = columnsFromRpc(frozen);
  }
  const commission = commissionForCharge(commissionCols, company?.take_rate_bps);

  // 4. Parcela escolhida revalidada contra a política (server-authoritative). A política é a da
  // plataforma com o parcelamento da reserva por cima (regra de repasse > padrão da empresa): em
  // estacionamento que não aceita 3x sem juros, a 3x sem juros não existe aqui e é recusada. O
  // cliente parcela o TOTAL (vaga + tarifa); os juros incidem sobre esse total.
  const policy = applyInstallmentOverride(platformPolicy, commission.installments);
  // Troca de datas: a diferença pela tabela da compra, conferida com a que o cliente viu na prévia.
  let quote: DateChangeQuote | null = null;
  if (dc) {
    const { data: q, error: qErr } = await admin.rpc("reprice_booking_dates", {
      p_booking_id: booking.id,
      p_check_in: dc.checkInAt,
      p_check_out: dc.checkOutAt,
    });
    if (qErr) return await recusar(400, qErr.message);
    quote = q as DateChangeQuote;
    if (!quote.available || quote.delta_cents == null) return await recusar(409, quote.reason ?? "Datas indisponíveis.");
    if (quote.delta_cents <= 0) return await recusar(409, "Esta troca não tem diferença a pagar.");
    if (quote.delta_cents !== dc.expectedDeltaCents) {
      return await recusar(409, "O valor mudou desde a cotação. Confira o novo valor antes de pagar.", { code: "quote_changed" });
    }
  }
  const baseCents = quote ? quote.delta_cents! : reaisToCents(Number(booking.total_amount));
  const plan = computeInstallmentPlan(baseCents, policy);
  const chosen = plan.find((o) => o.installments === input.installments);
  if (!chosen) return await recusar(422, "Parcelamento inválido para esta reserva.");
  const chargedCents = chosen.totalCents;
  const interestCents = chosen.interestCents;

  // 5. Split. Parceiro recebe sobre o preço da VAGA (base − tarifa); a Tarifa (E2.8, serviço
  // Movepark) e o excedente de juros vão pra perna da Movepark.
  // Na troca de datas a diferença é toda vaga: a tarifa não entra.
  const fareCents = dc ? 0 : booking.fare_price_cents ?? 0;
  const partnerBaseCents = baseCents - fareCents;
  let split;
  try {
    split = buildSplit({
      chargedCents,
      baseCents: partnerBaseCents,
      takeRateBps: commission.takeRateBps,
      moveparkRecipientId,
      partnerRecipientId: recipient?.external_recipient_id ?? null,
      requireRecipients: splitEnabled,
      platformFundedCents: quote ? chargeSplitBase(quote).platformFundedCents : platformFundedCents(booking.price_breakdown),
      method: "card",
      feePayer: commission.feePayer,
    });
  } catch (e) {
    return await recusar(422, e instanceof Error ? e.message : "Falha ao montar o split");
  }

  // 4b. Split dinâmico (E0.3.5): se o parceiro está devendo, esta venda abate até 100% da perna
  // dele. O razão (`split`) guarda a perna NORMAL; o que vai ao gateway é a perna menos o
  // abatimento, e o abatimento fica gravado na cobrança. A reserva fecha a corrida de duas vendas
  // simultâneas: conta como abatido até esta cobrança existir (ou vencer em 15 min).
  let debtRecoveryCents = 0;
  let debtReservationId: string | null = null;
  let feeCreditCents = 0;
  let feeCreditReservationId: string | null = null;
  let anticipationCompCents = 0;
  let anticipationAppliedCents = 0;
  let anticipationEstimateCents = 0;
  let gatewaySplit = split;
  if (splitEnabled) {
    const { data: reserva, error: reservaErr } = await admin.rpc("payout_debt_reserve", {
      p_company_id: location.company_id,
      p_max_cents: maxDebtRecoveryCents(split),
      // A perna que sobra é zero ou pelo menos o piso: nunca menor que a taxa que ela paga.
      // O piso só existe quando a perna do PARCEIRO paga a taxa; com a Movepark pagando, abate tudo.
      p_floor_cents: partnerRule(split)?.chargeProcessingFee ? debtFloorCents("card", split.reduce((a, r) => a + r.amount, 0)) : 0,
    });
    if (reservaErr) {
      // Sem reserva não dá para saber quanto abater; cobrar sem abater deixaria a dívida para a
      // próxima venda, o que é aceitável. Cobrar com abatimento errado, não.
      console.error("[%s] payout_debt_reserve falhou:", EDGE_NAME, reservaErr.message);
    } else {
      const r = (Array.isArray(reserva) ? reserva[0] : reserva) as
        | { reservation_id: string | null; amount_cents: number | string | null }
        | null;
      debtRecoveryCents = Number(r?.amount_cents ?? 0) || 0;
      debtReservationId = r?.reservation_id ?? null;
    }
    // 4c. Crédito da taxa do repasse automático (E0.3.13): a Movepark devolve nesta venda o que
    // ficou devendo ao parceiro, até a perna dela depois do abatimento. Reserva com lock, como a dívida.
    const { data: credito, error: creditoErr } = await admin.rpc("payout_fee_credit_reserve", {
      p_company_id: location.company_id,
      p_max_cents: appliedFeeCreditCents(split, debtRecoveryCents, Number.MAX_SAFE_INTEGER),
    });
    if (creditoErr) {
      console.error("[%s] payout_fee_credit_reserve falhou:", EDGE_NAME, creditoErr.message);
    } else {
      const c = (Array.isArray(credito) ? credito[0] : credito) as { reservation_id: string | null; amount_cents: number | string | null } | null;
      feeCreditCents = Number(c?.amount_cents ?? 0) || 0;
      feeCreditReservationId = c?.reservation_id ?? null;
    }
    // 4d. Antecipação paga pela Movepark (E0.3.14): o recebedor do parceiro antecipa em 30 dias e a
    // Pagar.me desconta a taxa dele. A estimativa com folga vai a mais na perna dele; o que não
    // couber na perna da Movepark vira crédito (anticipation_credit_cents) na próxima venda.
    const rateBps = Number(settingMap.card_anticipation_rate_monthly_bps || 0) || 0;
    const marginDays = Number(settingMap.card_anticipation_margin_days || 4) || 4;
    const partnerLeg = partnerRule(split);
    // Recebedor sem a coluna preenchida (criado depois de 23/11 pelo padrão global) segue o padrão.
    const anticipationOn =
      recipient?.anticipation_enabled ??
      String(settingMap.payout_anticipation_enabled ?? "").toLowerCase() === "true";
    if (anticipationOn && commission.anticipationPayer === "movepark" && partnerLeg && rateBps > 0) {
      anticipationCompCents = estimateAnticipationCompCents({
        installments: input.installments,
        partnerLegCents: partnerLeg.amount,
        // MDR zero de propósito: com a perna do parceiro pagando o MDR a base antecipada é menor, e
        // ignorar isso só aumenta a folga (o parceiro nunca termina abaixo do prometido).
        partnerMdrCents: 0,
        monthlyRateBps: rateBps,
        marginDays,
      });
      anticipationAppliedCents = appliedAnticipationCompCents(split, debtRecoveryCents, feeCreditCents, anticipationCompCents);
    }
    // 4e. Antecipação paga pelo PARCEIRO (23/11/2026, Kallef: por conta do estacionamento em
    // todos). Nada muda no split; a taxa prevista só fica gravada para a tela mostrá-la desde a
    // venda, antes de a Pagar.me antecipar (~D+29). MDR fora da conta: a previsão sai um pouco
    // acima, nunca abaixo. Um dia de folga: a 1ª parcela é antecipada um dia útil antes.
    if (anticipationOn && commission.anticipationPayer === "partner" && partnerLeg && rateBps > 0) {
      anticipationEstimateCents = estimatePartnerAnticipationFeeCents({
        installments: input.installments,
        partnerLegCents: partnerLeg.amount,
        partnerMdrCents: 0,
        monthlyRateBps: rateBps,
        marginDays: 1,
      });
    }
    try {
      gatewaySplit = splitForGateway(split, debtRecoveryCents, moveparkRecipientId, feeCreditCents, anticipationCompCents) as typeof split;
    } catch (e) {
      return await recusar(422, e instanceof Error ? e.message : "Falha ao montar o split");
    }
  }

  // 6. Pagador: do snapshot do booking (o titular preencheu no checkout). Não lê profiles; o e-mail
  //    cai no auth só como reforço (login por e-mail tem o e-mail travado na conta).
  const payerName =
    [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim() ||
    booking.customer_name ||
    "Cliente Movepark";
  const { data: authUser } = await admin.auth.admin.getUserById(booking.profile_id);
  const email = booking.customer_email ?? authUser?.user?.email ?? null;
  if (!email) return await recusar(422, "Cliente sem e-mail para a cobrança.");
  if (!isValidChargeDocument(booking.customer_tax_id)) {
    return await recusar(422, "Cliente sem CPF/CNPJ válido para a cobrança. Informe o documento no checkout.");
  }

  // Cartão no Pagar.me exige telefone do cliente (412 "At least one customer phone is required",
  // medido na MP-200728 em 05/10/2026). Vem do snapshot do booking, como no PIX.
  const phone = parseBrPhone(booking.customer_phone);
  if (!phone) {
    return await recusar(422, "Cliente sem telefone (com DDD) para a cobrança. Informe o telefone no checkout.");
  }

  // 7. Resolve o cartão: salvo (card_id) ou novo (token).
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

  // 7a. Reprovações do antifraude: depois do limite o cartão não vai mais ao gateway, porque cada
  // tentativa piora o score do comprador e nenhuma passou desde 20/10/2026. O cliente segue no PIX.
  const { count: reprovacoes } = await admin
    .from("payment_gateway_event")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id)
    .eq("kind", "charge_failed")
    .eq("note", ANTIFRAUD_NOTE);
  if ((reprovacoes ?? 0) >= ANTIFRAUD_RETRY_LIMIT) {
    return await recusar(402, ANTIFRAUD_MESSAGE, { code: "antifraud_limit" });
  }

  // 8. Cobrança no gateway
  let gateway;
  try {
    gateway = getGateway("pagarme");
  } catch (e) {
    if (e instanceof GatewayConfigError) return await recusar(503, e.message);
    throw e;
  }

  // Troca de datas: a anterior ainda aberta (PIX gerado e não pago) sai, e a vaga nova fica segura
  // antes de o cartão passar. Sem vaga, nada é cobrado.
  if (dc) {
    await cancelPendingDateChanges(admin, gateway, booking.id);
    const { error: holdErr } = await admin.rpc("hold_paid_date_change", {
      p_booking_id: booking.id,
      p_check_in: dc.checkInAt,
      p_check_out: dc.checkOutAt,
    });
    if (holdErr) return await recusar(409, holdErr.message);
  }

  const externalCode = dc ? `${booking.code}-DT-${crypto.randomUUID().slice(0, 4).toUpperCase()}` : booking.code;
  const attemptStartedAt = new Date();
  const idempotencyKey = crypto.randomUUID();
  let result = await gateway.createCardCharge({
    externalCode,
    idempotencyKey,
    amountCents: chargedCents,
    customer: {
      name: payerName,
      email,
      document: booking.customer_tax_id ?? null,
      type: customerTypeFor(booking.customer_tax_id),
      phone,
    },
    items: dc ? buildDateChangeItems(booking.code, baseCents, interestCents) : buildCardItems(booking.code, baseCents, interestCents),
    // Com a custódia ligada o gateway não recebe split: o valor cai inteiro na Movepark.
    // O snapshot gravado em `payment.split` segue sendo o razão do que devemos ao parceiro.
    split: splitEnabled ? gatewaySplit : undefined,
    card: cardRef,
    billingAddress: input.billingAddress ?? undefined,
    ip: clientIp(req.headers) ?? undefined,
    installments: input.installments,
    metadata: { booking_id: booking.id, booking_code: booking.code, base_cents: String(baseCents), ...(dc ? { kind: "date_change" } : {}) },
  });

  // 8b. Resposta desconhecida (5xx, timeout, rede): o pedido pode ter sido criado mesmo assim
  // (25/11/2026, MP-F00991). Procura no gateway antes de dizer qualquer coisa ao cliente.
  const unknownOutcome = isUnknownGatewayOutcome(result.httpStatus);
  if (unknownOutcome) {
    const achado = await recoverOrder(admin, gateway, {
      bookingId: booking.id,
      code: externalCode,
      attemptStartedAt,
      amountCents: chargedCents,
      paymentMethod: "credit_card",
    });
    await logGatewayEvent(admin, {
      paymentId: null,
      bookingId: booking.id,
      kind: "charge_unknown",
      httpStatus: result.httpStatus,
      request: { method: "card", amount_cents: chargedCents, installments: input.installments, idempotency_key: idempotencyKey },
      response: result.raw,
      note: achado
        ? `gateway respondeu ${result.httpStatus}, mas o pedido ${achado.orderId} existe (${achado.status})`
        : `gateway respondeu ${result.httpStatus} e o pedido não apareceu na busca`,
    });
    if (achado) result = achado;
  }

  // Recusa do emissor → registra failed e responde 402 (sem confirmar a reserva).
  // Campos da troca de datas na cobrança: o webhook aplica a cotação gravada aqui.
  const dcCols = dc
    ? {
      kind: "date_change",
      date_change_check_in_at: dc.checkInAt,
      date_change_check_out_at: dc.checkOutAt,
      date_change_quote: quote,
      // O cron solta a vaga nova se a análise do cartão não terminar até aqui.
      expires_at: new Date(Date.now() + pixExpiresInSeconds((await admin.rpc("get_booking_hold_minutes")).data) * 1000).toISOString(),
    }
    : {};

  if (result.status === "failed") {
    const failedId = crypto.randomUUID();
    await admin.from("payment").insert({
      id: failedId,
      booking_id: booking.id,
      provider: "pagarme",
      method: "card",
      provider_payment_id: result.orderId,
      provider_charge_id: result.chargeId,
      amount: chargedCents / 100,
      // Troca de datas: nasce pendente só para a liberação soltar a vaga nova, e logo vira recusada.
      status: dc ? "pending" : "failed",
      ...dcCols,
      installments: input.installments,
      split,
      split_sent_to_gateway: splitEnabled,
      debt_recovered_cents: debtRecoveryCents,
      debt_reservation_id: debtReservationId,
    fee_credit_returned_cents: feeCreditCents,
    fee_credit_reservation_id: feeCreditReservationId,
    anticipation_comp_cents: anticipationAppliedCents || null,
    anticipation_credit_cents: Math.max(0, anticipationCompCents - anticipationAppliedCents),
    anticipation_estimate_cents: anticipationEstimateCents || null,
    });
    if (dc) {
      await admin.rpc("expire_paid_date_change_hold", { p_payment_id: failedId });
      await admin.from("payment").update({ status: "failed" }).eq("id", failedId);
    }
    // Recusa do emissor e erro nosso no pedido chegam pelo mesmo status; o gateway_response separa.
    const detalhe = chargeFailureDetail(result.raw);
    await logGatewayEvent(admin, {
      paymentId: null,
      bookingId: booking.id,
      kind: "charge_failed",
      httpStatus: result.httpStatus,
      request: { method: "card", amount_cents: chargedCents, installments: input.installments },
      response: result.raw,
      note: detalhe.integrationError
        ? `erro de integração (${detalhe.code}): ${detalhe.messages.join("; ") || "sem mensagem"}`
        : detalhe.antifraudReproved
          ? ANTIFRAUD_NOTE
          : `cartão recusado pelo emissor${detalhe.code ? ` (${detalhe.code})` : ""}`,
    });
    if (detalhe.integrationError) {
      // Dado do cartão recusado (CVV, validade, nome): o cliente corrige e paga. Antes caía na
      // mensagem genérica abaixo e o cliente desistia (MP-2356FD, R$ 245, 10/10/2026).
      const campo = invalidCardField(detalhe.messages);
      if (campo) return jsonResponse({ error: cardFieldMessage(campo), code: "card_data_invalid" }, 402);
      console.error("[%s] pedido recusado pelo adquirente:", EDGE_NAME, detalhe.code, detalhe.messages);
      return jsonResponse({ error: "Não conseguimos processar o pagamento agora. Tente de novo em alguns minutos." }, 502);
    }
    if (detalhe.antifraudReproved) {
      return jsonResponse(
        { error: ANTIFRAUD_MESSAGE, code: "antifraud_reproved" },
        402,
      );
    }
    return jsonResponse({ error: "Cartão recusado. Tente outro cartão." }, 402);
  }
  // 8c. Continua sem saber, e não achou o pedido: o cartão pode ter sido cobrado (na noite de 25/11
  // a cobrança só apareceu 1h15 depois). Grava o pagamento pendente SEM ids do gateway: segura a
  // vaga, bloqueia nova tentativa e é onde o webhook pendura a cobrança se ela aparecer. Sem aviso
  // até o prazo, o cron a dá como recusada e a reserva segue o rumo normal. (Troca de datas fica
  // de fora: a vaga nova já está presa no hold dela, e o webhook alerta a cobrança sem dono.)
  if (unknownOutcome && !result.orderId && !dc) {
    const expiresAt = unconfirmedExpiresAt();
    const unconfirmedId = crypto.randomUUID();
    const { error: ucErr } = await admin.from("payment").insert({
      id: unconfirmedId,
      booking_id: booking.id,
      provider: "pagarme",
      method: "card",
      provider_payment_id: null,
      provider_charge_id: null,
      amount: chargedCents / 100,
      status: "pending",
      expires_at: expiresAt,
      installments: input.installments,
      split,
      split_sent_to_gateway: splitEnabled,
      debt_recovered_cents: debtRecoveryCents,
      debt_reservation_id: debtReservationId,
      fee_credit_returned_cents: feeCreditCents,
      fee_credit_reservation_id: feeCreditReservationId,
      anticipation_comp_cents: anticipationAppliedCents || null,
      anticipation_credit_cents: Math.max(0, anticipationCompCents - anticipationAppliedCents),
      anticipation_estimate_cents: anticipationEstimateCents || null,
    });
    if (ucErr) {
      console.error("[%s] não gravei a cobrança sem resposta:", EDGE_NAME, ucErr.message);
      return await recusar(502, UNCONFIRMED_CHARGE_MESSAGE, { response: result.raw, code: "charge_unconfirmed" });
    }
    if (debtReservationId) {
      await admin.from("payout_debt_reservation").update({ consumed_by_payment_id: unconfirmedId }).eq("id", debtReservationId);
    }
    if (feeCreditReservationId) {
      await admin.from("payout_fee_credit_reservation").update({ consumed_by_payment_id: unconfirmedId }).eq("id", feeCreditReservationId);
    }
    // A reserva vive enquanto a cobrança não tem resposta: o checkout não mostra "expirada" para
    // quem pode ter pago, e o cron não a expira (cartão pendente segura a reserva).
    await admin.from("booking").update({ expires_at: expiresAt }).eq("id", booking.id).eq("status", "pending");
    await logGatewayEvent(admin, {
      paymentId: unconfirmedId,
      bookingId: booking.id,
      kind: "charge_unconfirmed",
      httpStatus: result.httpStatus,
      request: { method: "card", amount_cents: chargedCents, installments: input.installments, idempotency_key: idempotencyKey },
      response: result.raw,
      note: `sem resposta do gateway; esperando o aviso até ${expiresAt}`,
    });
    console.error("[%s] cobrança sem resposta do gateway:", EDGE_NAME, booking.code, result.httpStatus);
    return jsonResponse(
      {
        payment_id: unconfirmedId,
        status: "unconfirmed",
        message: UNCONFIRMED_CHARGE_MESSAGE,
        installments: input.installments,
        charged_amount: chargedCents / 100,
        interest_amount: interestCents / 100,
        saved_card: false,
      },
      202,
    );
  }

  if (!result.orderId || (result.httpStatus ?? 500) >= 400) {
    console.error("Pagar.me card order falhou:", result.httpStatus, JSON.stringify(result.raw));
    return await recusar(502, "Falha ao processar o cartão.", { response: result.raw });
  }

  // 9. Grava o payment (paid imediato ou pending p/ análise → webhook confirma)
  const paymentId = crypto.randomUUID();
  const { error: payErr } = await admin.from("payment").insert({
    id: paymentId,
    booking_id: booking.id,
    provider: "pagarme",
    method: "card",
    provider_payment_id: result.orderId,
    provider_charge_id: result.chargeId,
    amount: chargedCents / 100,
    status: chargeStatusToPaymentStatus(result.status),
    installments: input.installments,
    ...dcCols,
    split,
    split_sent_to_gateway: splitEnabled,
    debt_recovered_cents: debtRecoveryCents,
    debt_reservation_id: debtReservationId,
    fee_credit_returned_cents: feeCreditCents,
    fee_credit_reservation_id: feeCreditReservationId,
    anticipation_comp_cents: anticipationAppliedCents || null,
    anticipation_credit_cents: Math.max(0, anticipationCompCents - anticipationAppliedCents),
    anticipation_estimate_cents: anticipationEstimateCents || null,
  });
  if (payErr) return await recusar(500, payErr.message);
  // Rastro do gateway (E0.3.9). O cartão nunca entra aqui: só ids, valor, parcelas e split.
  await logGatewayEvent(admin, {
    paymentId,
    bookingId: booking.id,
    kind: "charge_created",
    httpStatus: result.httpStatus,
    request: {
      method: "card",
      amount_cents: chargedCents,
      installments: input.installments,
      split: splitEnabled ? gatewaySplit : null,
      // De onde veio a comissão desta venda (E0.3.12): canal, percentual e quem paga a taxa.
      commission: { channel: commission.channel, take_rate_bps: commission.takeRateBps, fee_payer: commission.feePayer },
      // Parcelamento que valeu nesta cobrança: nulo = política da plataforma (09/11/2026).
      installments_override: commission.installments,
      // Antecipação paga pela Movepark (E0.3.14): estimada e quanto coube no split.
      anticipation: { payer: commission.anticipationPayer, comp_cents: anticipationCompCents, applied_cents: anticipationAppliedCents, estimate_cents: anticipationEstimateCents },
    },
    response: result.raw,
  });
  if (debtReservationId) {
    await admin
      .from("payout_debt_reservation")
      .update({ consumed_by_payment_id: paymentId })
      .eq("id", debtReservationId);
  }
  if (feeCreditReservationId) {
    await admin
      .from("payout_fee_credit_reservation")
      .update({ consumed_by_payment_id: paymentId })
      .eq("id", feeCreditReservationId);
  }

  // 9b. Renova o hold enquanto pending (E0.3.1-a). Cartão aprovado inline vira confirmed (a RPC zera
  // o expires_at); cartão em análise (authorized/pending) mantém o hold vivo até o webhook.
  // Mesmo helper das cobranças PIX: `Number(holdMin ?? 30)` virava NaN quando a RPC não respondia,
  // e um `expires_at` inválido apaga o hold em vez de renovar.
  if (!dc) {
    const { data: holdMin } = await admin.rpc("get_booking_hold_minutes");
    const holdSeconds = pixExpiresInSeconds(holdMin);
    await admin
      .from("booking")
      .update({ expires_at: new Date(Date.now() + holdSeconds * 1000).toISOString() })
      .eq("id", booking.id)
      .eq("status", "pending");
  }

  // 9c. Aprovado na hora → confirma inline (não espera o webhook), melhorando o feedback no checkout.
  // O webhook `charge.paid`/`order.paid` chega depois, vê 'confirmed' → noop, e segue como gerador
  // único do voucher. Cartão em análise NÃO confirma aqui — o webhook confirma quando virar 'paid'.
  if (result.status === "paid" && dc) {
    // Diferença aprovada na hora: grava a troca com a cotação que o cliente pagou.
    const { error: dcErr } = await admin.rpc("apply_paid_date_change", {
      p_booking_id: booking.id,
      p_check_in: dc.checkInAt,
      p_check_out: dc.checkOutAt,
      p_actor_id: userData.user.id,
      p_acquire: false,
      p_actor_role: "customer",
      p_quote: quote,
    });
    if (dcErr) console.error("[%s] apply_paid_date_change falhou:", EDGE_NAME, dcErr.message);
    else await notifyDatesChanged(admin, booking.id, { chargedCents, method: "card" });
  } else if (result.status === "paid") {
    await admin.rpc("confirm_or_refund_booking", {
      p_booking_id: booking.id,
      p_payment_id: paymentId,
    });
  }

  // 9d. Cartão aprovado: anula o PIX que o cliente gerou antes e deixou aberto, para ele não pagar a
  // mesma reserva duas vezes, e confere se a reserva ficou com mais de um pagamento (alerta a equipe).
  // (Na troca de datas a reserva já tinha o pagamento dela: alertar "dois pagamentos" seria falso, e o
  // PIX de diferença aberto já foi anulado antes da cobrança.)
  if (!dc && (result.status === "paid" || result.status === "authorized")) {
    await voidOpenPixCharges(admin, gateway, booking.id);
    await alertIfDuplicatePayment(admin, booking.id, paymentId);
  }

  // 10. Salvar o cartão (opt-in) — só token+brand+last4 (nunca PAN).
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
      installments: input.installments,
      charged_amount: chargedCents / 100,
      interest_amount: interestCents / 100,
      saved_card: savedCard,
      ...(dc ? { date_change: true, applied: result.status === "paid" } : {}),
    },
    201,
  );
}

Deno.serve(async (req: Request) => {
  const lock: LockSlot = {};
  try {
    return await handle(req, lock);
  } finally {
    await lock.release?.();
  }
});
