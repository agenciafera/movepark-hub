// Lógica pura do webhook do Pagar.me (testável sem rede): auth básica, parsing do evento e
// decisão de status do payment.

import { chargeStatusToPaymentStatus } from "../_shared/payments/index.ts";
import { mapChargeStatus } from "../_shared/payments/pagarme.ts";
import type { ChargeStatus } from "../_shared/payments/types.ts";

/** Comparação de strings em tempo (quase) constante — evita vazar o segredo por timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  // O XOR do comprimento garante que strings de tamanhos diferentes nunca casem,
  // sem retornar cedo (o loop sempre roda sobre o esperado).
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verifica o header Basic auth do Pagar.me contra o esperado ("user:pass").
 * - `expectedUserPass` ausente: em staging (`required=false`) aceita; em produção
 *   (`required=true`) **rejeita** (fail-closed — nunca aceitar webhook sem credencial).
 */
export function verifyBasicAuth(
  header: string | null,
  expectedUserPass: string | undefined,
  required = false,
): boolean {
  if (!expectedUserPass) return !required; // sem credencial: aceita só fora de produção
  if (!header) return false;
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  let expectedB64: string;
  try {
    expectedB64 = btoa(expectedUserPass);
  } catch {
    return false;
  }
  return timingSafeEqual(m[1].trim(), expectedB64);
}

export interface ParsedEvent {
  eventId: string | null;
  type: string;
  orderId: string | null;
  /** Id da cobrança (ch_...) quando o evento é `charge.*`. Desempata quando há mais de uma
   *  cobrança no mesmo booking, sem depender de recência (86ajnet8w). */
  chargeId: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  rawStatus: string | null;
}

/** Intenção de um evento de cobrança/ordem, derivada do TIPO (não do data.status). */
export type WebhookIntent = "paid" | "refund" | "partial_refund" | "cancel";

/**
 * Decide a ação a partir do TIPO do evento — e NÃO do `data.status`. Crítico para estorno de PIX:
 * a Pagar.me envia `charge.refunded` com `data.status: "paid"` (o refund fica em `last_transaction`),
 * então confiar no status faria o estorno cair no branch "paid" e nunca refletir. Retorna `null`
 * para tipos não reconhecidos (o handler cai no mapeamento genérico por status).
 */
export function webhookIntentFromType(type: string | null | undefined): WebhookIntent | null {
  const action = (type ?? "").toLowerCase().split(".").slice(1).join(".");
  switch (action) {
    case "paid":
      return "paid";
    case "refunded":
      return "refund";
    // Estorno parcial: a Pagar.me chama de `partial_canceled`; `partially_refunded` é defensivo
    // (outras contas/versões).
    case "partial_canceled":
    case "partially_refunded":
      return "partial_refund";
    case "canceled":
    case "cancelled":
      return "cancel";
    default:
      return null;
  }
}

/** Extrai os campos relevantes do payload de webhook (order.* ou charge.*). */
export function parseWebhookEvent(body: unknown): ParsedEvent {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = (b.data ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const type = (b.type as string) ?? "";
  // charge.* → data.order_id é a ordem; data.id é a cobrança (ch_...).
  // order.*  → data.id é a ordem; a cobrança fica em data.charges[].
  const orderId = (data.order_id as string) ?? (data.id as string) ?? null;
  const chargeId = type.toLowerCase().startsWith("charge.")
    ? ((data.id as string) ?? null)
    : (((data.charges as Array<Record<string, unknown>>)?.[0]?.id as string) ?? null);
  return {
    eventId: (b.id as string) ?? null,
    type,
    orderId,
    chargeId,
    bookingId: (metadata.booking_id as string) ?? null,
    bookingCode: (data.code as string) ?? (metadata.booking_code as string) ?? null,
    rawStatus: (data.status as string) ?? null,
  };
}

// ── Resolução do payment casado com o evento ────────────────────────────────

/** Payment casado com o evento (o que o handler precisa pra decidir a ação). */
export interface MatchedPayment {
  id: string;
  booking_id: string;
  kind: string | null;
  fare_target_tier: string | null;
  date_change_check_in_at: string | null;
  date_change_check_out_at: string | null;
  status: string | null;
  paid_at: string | null;
}

/** Buscas precisas por identificador único da cobrança. Sem busca por booking/recência. */
export interface PaymentLookup {
  byOrderId(orderId: string): Promise<MatchedPayment | null>;
  byChargeId(chargeId: string): Promise<MatchedPayment | null>;
}

/**
 * Acha o payment que o evento cita, SÓ por identificador único: primeiro a ordem
 * (`provider_payment_id`), depois a cobrança (`provider_charge_id`). Nunca por "o mais recente do
 * booking": uma reserva pode ter várias cobranças (reserva, upgrade de tarifa, troca de datas), e
 * chutar a mais recente aplicaria o evento na cobrança errada, de forma silenciosa (86ajnet8w).
 * Sem match, devolve null: melhor o evento ficar não processado do que aplicado no lugar errado.
 */
export async function resolvePayment(
  ev: Pick<ParsedEvent, "orderId" | "chargeId">,
  lookup: PaymentLookup,
): Promise<MatchedPayment | null> {
  if (ev.orderId) {
    const byOrder = await lookup.byOrderId(ev.orderId);
    if (byOrder) return byOrder;
  }
  if (ev.chargeId) {
    const byCharge = await lookup.byChargeId(ev.chargeId);
    if (byCharge) return byCharge;
  }
  return null;
}

// ── Decisão de status do payment ────────────────────────────────────────────

/** Status de payment considerados terminais pela guarda de rebaixamento. */
export const TERMINAL_PAYMENT_STATUSES = ["paid", "refunded", "cancelled"] as const;

export interface StatusDecisionInput {
  /** Intenção derivada do TIPO do evento (`webhookIntentFromType`). */
  intent: WebhookIntent | null;
  /** `payment.status` atual no banco. */
  currentStatus: string | null;
  /** `payment.paid_at` atual. Preenchido = a cobrança já foi liquidada alguma vez. */
  paidAt: string | null;
  /** `data.status` cru do evento. */
  rawStatus: string | null;
  /** `type` cru do evento (usado como fallback do status). */
  eventType: string;
}

export type StatusDecision =
  | { action: "noop"; reason: string }
  | { action: "update"; chargeStatus: ChargeStatus; paymentStatus: string };

/**
 * Decide o que fazer com o `payment` diante de um evento de cobrança/ordem.
 *
 * Extraída do `index.ts` sem mudança de comportamento: hoje a guarda contra rebaixamento só cobre
 * evento SEM intent (`charge.updated` e afins) sobre payment terminal. Um evento COM intent que
 * mapeie para um status não pago atravessa a guarda e rebaixa um pagamento já liquidado. Ver o
 * teste ignorado em `logic.test.ts` (C-12) e a tarefa https://app.clickup.com/t/86ajmwb4u.
 */
export function decidePaymentStatus(input: StatusDecisionInput): StatusDecision {
  // Evento benigno (sem intent definida, ex.: `charge.updated` depois do pagamento) sobre um
  // payment já terminal: NÃO rebaixa o status. Sem isto, um evento pós-pagamento derruba 'paid'
  // de volta pra 'pending' (deixava o date_change preso e o expire liberaria vaga ativa).
  if (
    input.intent === null &&
    (TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(input.currentStatus ?? "")
  ) {
    return { action: "noop", reason: "benign_event_on_terminal_payment" };
  }

  const chargeStatus: ChargeStatus =
    input.intent === "refund"
      ? "refunded"
      : input.intent === "cancel"
        ? "canceled"
        : input.intent === "paid"
          ? "paid"
          : mapChargeStatus(input.rawStatus ?? input.eventType.split(".")[1]);
  const paymentStatus = chargeStatusToPaymentStatus(chargeStatus);

  // Guarda de rebaixamento (86ajmwb4u, C-12): um pagamento já liquidado ('paid') só tem UMA saída
  // legítima, o estorno ('refunded'). Qualquer evento que mande 'paid' de volta pra pendente/falho
  // ou pra cancelado é fora de ordem e é ignorado. `paid_at` reforça o sinal: só o webhook o grava,
  // na liquidação. Espelha a regra atômica de apply_payment_webhook_status (a trava de linha lá é
  // que fecha a corrida de concorrência; aqui é a defesa do caso sequencial).
  const liquidated = input.currentStatus === "paid" || input.paidAt != null;
  if (liquidated && paymentStatus !== "paid" && paymentStatus !== "refunded") {
    return { action: "noop", reason: "downgrade_blocked" };
  }

  return { action: "update", chargeStatus, paymentStatus };
}

// ── Transferências (saques) — E0.3.3 ────────────────────────────────────────

export type WithdrawalStatus = "created" | "processing" | "paid" | "failed" | "canceled";

export interface ParsedTransfer {
  type: string;
  transferId: string | null;
  recipientId: string | null;
  amountCents: number | null;
  feeCents: number | null;
  rawStatus: string | null;
}

/** Extrai os campos de um evento `transfer.*` do Pagar.me. */
export function parseTransferEvent(body: unknown): ParsedTransfer {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = (b.data ?? {}) as Record<string, unknown>;
  const recipient = (data.recipient ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    type: (b.type as string) ?? "",
    transferId: (data.id as string) ?? null,
    recipientId: (data.recipient_id as string) ?? (recipient.id as string) ?? null,
    amountCents: num(data.amount),
    feeCents: num(data.fee) ?? num(data.funding_fee),
    rawStatus: (data.status as string) ?? null,
  };
}

// ── Recebedor (status/KYC) — E2.8 manutenção ────────────────────────────────

export interface ParsedRecipient {
  type: string;
  /** id do recebedor no gateway (data.id). */
  recipientId: string | null;
  /** status cru do recebedor (registration/affiliation/active/refused/...). */
  rawStatus: string | null;
}

/** Extrai os campos de um evento `recipient.*` (created/updated) do Pagar.me. */
export function parseRecipientEvent(body: unknown): ParsedRecipient {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = (b.data ?? {}) as Record<string, unknown>;
  return {
    type: (b.type as string) ?? "",
    recipientId: (data.id as string) ?? null,
    rawStatus: (data.status as string) ?? null,
  };
}

/** Status cru da transferência → status normalizado do saque. */
export function transferStatusToWithdrawalStatus(raw: string | null | undefined): WithdrawalStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "paid":
    case "transferred":
      return "paid";
    case "failed":
    case "with_error":
      return "failed";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "processing":
    case "pending_transfer":
    case "pending":
      return "processing";
    case "created":
    case "":
    default:
      return "created";
  }
}
