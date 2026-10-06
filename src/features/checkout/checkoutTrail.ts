// Rastro do checkout no navegador (06/10/2026). O que acontece entre o clique em "Pagar" e a Edge
// não deixava marca em lugar nenhum: a tokenização vai do navegador direto à Pagar.me, e um erro
// ali nunca chegava ao backend. Cada tentativa e cada falha vão para `payment_gateway_event` (kind
// `client:*`) pela RPC `log_checkout_event`, e aparecem no rastro da reserva no Manager.
//
// Nunca entra dado de cartão: só bandeira, últimos 4, parcelas e o erro devolvido.

import { supabase } from "@/lib/supabase";
import { TokenizeError } from "@/lib/pagarme-tokenize";

export type CheckoutEventKind =
  | "client:card_attempt"
  | "client:card_validation"
  | "client:card_tokenize_failed"
  | "client:card_charge_failed"
  | "client:card_charge_ok"
  | "client:pix_failed";

export type CheckoutEventDetail = Record<string, string | number | boolean | null | string[]>;

/** Etapa onde a tentativa de cartão morreu, para o rastro. */
export type CardFailureStage = "validation" | "tokenize" | "charge";

/** Monta o kind, o status e o detalhe de uma falha de cartão. Pura, para teste. */
export function cardFailureEvent(
  stage: CardFailureStage,
  err: unknown,
  ctx: CheckoutEventDetail = {},
): { kind: CheckoutEventKind; httpStatus: number | null; detail: CheckoutEventDetail } {
  const message = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
  if (stage === "tokenize" && err instanceof TokenizeError) {
    return {
      kind: "client:card_tokenize_failed",
      httpStatus: err.httpStatus,
      detail: {
        ...ctx,
        message,
        gateway_message: err.diagnostic.gateway_message,
        fields: err.diagnostic.fields,
      },
    };
  }
  const kind: CheckoutEventKind =
    stage === "validation"
      ? "client:card_validation"
      : stage === "tokenize"
        ? "client:card_tokenize_failed"
        : "client:card_charge_failed";
  const httpStatus =
    err && typeof err === "object" && "httpStatus" in err && typeof err.httpStatus === "number"
      ? err.httpStatus
      : null;
  return { kind, httpStatus, detail: { ...ctx, message } };
}

/** Grava um evento no rastro da reserva. Best-effort: nunca atrasa nem derruba o pagamento. */
export function logCheckoutEvent(
  bookingCode: string,
  kind: CheckoutEventKind,
  httpStatus: number | null = null,
  detail: CheckoutEventDetail | null = null,
): void {
  try {
    // `log_checkout_event` não está em `database.ts` porque o `supabase gen types` vem derrubando
    // funções que existem no banco, e regenerar apagaria os tipos delas (ver payouts/api.ts).
    // `.bind(supabase)`: sem isso o método sai desamarrado do cliente e quebra no `this`.
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<unknown>;
    void Promise.resolve(
      rpc("log_checkout_event", {
        p_booking_code: bookingCode,
        p_kind: kind,
        p_http_status: httpStatus,
        p_detail: detail,
      }),
    ).catch(() => {});
  } catch {
    // Sem cliente (SSR, env ausente): o rastro é opcional.
  }
}
