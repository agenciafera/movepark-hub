// Cobrança de resultado desconhecido (26/11/2026, depois da MP-F00991 e da MP-C365C9).
//
// Na noite de 25/11 o Pagar.me respondeu HTTP 500 ao POST /orders por uns 15 minutos e, mesmo
// assim, criou e aprovou as cobranças (os avisos de pago chegaram 1h15 depois). O Hub tratava o 500
// como recusa: não gravava `payment`, dizia ao cliente para tentar de novo, e o webhook descartava
// o pago por não achar a cobrança. Resultado: três cartões cobrados sem reserva, um deles duas vezes.
//
// A regra agora: 5xx, timeout ou erro de rede NÃO é recusa, é "não sei". Quem cobra faz duas coisas:
//   1. procura o pedido no gateway pelo código (`recoverOrder`); achou, segue como se o POST tivesse
//      respondido;
//   2. não achou (cartão da reserva): grava o `payment` pendente SEM ids do gateway, com prazo
//      (`UNCONFIRMED_CHARGE_WINDOW_MINUTES`). A linha segura a vaga, bloqueia nova tentativa no
//      cartão e no PIX, e é nela que o webhook pendura a cobrança se ela aparecer depois
//      (`pagarme-webhook`). Passado o prazo sem aviso, o cron a dá como recusada e a reserva expira.

import type { GatewayOrder, PaymentGateway } from "./types.ts";

/** Quanto a cobrança sem resposta segura a vaga e bloqueia nova tentativa. */
export const UNCONFIRMED_CHARGE_WINDOW_MINUTES = 60;

/** Folga para trás na busca: relógio do gateway e o nosso não batem ao segundo. */
const SEARCH_SKEW_MS = 60_000;

/** Mensagem ao cliente quando a cobrança ficou sem resposta. */
export const UNCONFIRMED_CHARGE_MESSAGE =
  "Não conseguimos confirmar o pagamento com a operadora do cartão. Não pague de novo: se a cobrança passar, a reserva é confirmada e o voucher chega no seu e-mail. Em até 1 hora você fica sabendo.";

/** Mensagem para quem tenta pagar de novo enquanto a anterior não teve resposta. */
export const UNCONFIRMED_IN_FLIGHT_MESSAGE =
  "Seu pagamento anterior ainda está sendo confirmado pela operadora do cartão. Para não cobrar duas vezes, espere a confirmação antes de pagar de novo.";

/**
 * O gateway não disse o que aconteceu: sem status (erro de rede vira 0), timeout ou 5xx. 4xx é
 * resposta (recusa, validação, limite): o pedido não foi criado.
 */
export function isUnknownGatewayOutcome(httpStatus: number | null | undefined): boolean {
  if (httpStatus == null || httpStatus === 0) return true;
  return httpStatus === 408 || httpStatus >= 500;
}

/** `created_at` do gateway → ms. A v5 às vezes manda sem fuso; é UTC. */
function parseGatewayDate(raw: string | null): number | null {
  if (!raw) return null;
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Início da busca: a tentativa menos a folga de relógio. */
export function searchSinceIso(attemptStartedAt: Date): string {
  return new Date(attemptStartedAt.getTime() - SEARCH_SKEW_MS).toISOString();
}

/**
 * Escolhe, entre os pedidos com o código da reserva, o que nasceu desta tentativa: mesmo meio,
 * mesmo valor, criado depois do início (com folga) e que ainda não está em nenhum `payment`. O
 * código é o da reserva em toda tentativa, então sem o filtro de ids conhecidos uma recusa anterior
 * seria lida como o resultado desta. Mais de um candidato: o mais novo.
 */
export function pickRecoveredOrder(
  orders: GatewayOrder[],
  opts: { attemptStartedAt: Date; amountCents: number; paymentMethod: string; knownOrderIds: Set<string> },
): GatewayOrder | null {
  const since = opts.attemptStartedAt.getTime() - SEARCH_SKEW_MS;
  const candidatos = orders
    .filter((o) => o.orderId && !opts.knownOrderIds.has(o.orderId))
    .filter((o) => o.paymentMethod === opts.paymentMethod && o.amountCents === opts.amountCents)
    .map((o) => ({ o, at: parseGatewayDate(o.createdAt) }))
    .filter((x) => x.at != null && x.at >= since)
    .sort((a, b) => (b.at as number) - (a.at as number));
  return candidatos[0]?.o ?? null;
}

/**
 * Depois de um resultado desconhecido: o pedido existe no gateway? Nunca lança. `null` = não achou,
 * o que NÃO prova que não foi criado (na noite de 25/11 a cobrança só apareceu 1h15 depois).
 */
export async function recoverOrder(
  // deno-lint-ignore no-explicit-any
  admin: any,
  gateway: PaymentGateway,
  opts: { bookingId: string; code: string; attemptStartedAt: Date; amountCents: number; paymentMethod: string },
): Promise<GatewayOrder | null> {
  try {
    const [orders, { data: known }] = await Promise.all([
      gateway.findOrdersByCode(opts.code, searchSinceIso(opts.attemptStartedAt)),
      admin.from("payment").select("provider_payment_id").eq("booking_id", opts.bookingId).not("provider_payment_id", "is", null),
    ]);
    const knownOrderIds = new Set(
      ((known ?? []) as { provider_payment_id: string }[]).map((r) => r.provider_payment_id),
    );
    return pickRecoveredOrder(orders, { ...opts, knownOrderIds });
  } catch (e) {
    console.error("[unconfirmed] busca do pedido falhou:", opts.code, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Prazo da cobrança sem resposta, a partir de agora. */
export function unconfirmedExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + UNCONFIRMED_CHARGE_WINDOW_MINUTES * 60_000).toISOString();
}

/**
 * Cobrança de cartão desta reserva ainda sem resposta do gateway e dentro do prazo. Enquanto
 * existir, ninguém cobra a reserva de novo (cartão nem PIX).
 */
export async function findInFlightUnconfirmed(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bookingId: string,
  now: Date = new Date(),
): Promise<{ id: string; expires_at: string } | null> {
  const { data, error } = await admin
    .from("payment")
    .select("id, expires_at")
    .eq("booking_id", bookingId)
    .eq("kind", "booking")
    .eq("method", "card")
    .eq("status", "pending")
    .is("provider_payment_id", null)
    .gt("expires_at", now.toISOString())
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[unconfirmed] leitura da cobrança sem resposta falhou:", bookingId, error.message);
    return null;
  }
  return (data as { id: string; expires_at: string } | null) ?? null;
}
