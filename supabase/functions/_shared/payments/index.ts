// Fábrica de gateway — ÚNICO ponto de dispatch por provider. O resto do código pede
// `getGateway(provider)` e fala só pela interface `PaymentGateway` (ADR-004).

import type { ChargeStatus, PaymentGateway } from "./types.ts";
import { PagarmeGateway } from "./pagarme.ts";
import { MockGateway } from "./mock.ts";

export * from "./types.ts";
export { buildSplit } from "./split.ts";

/** ChargeStatus (gateway) → enum SQL `payment_status` ('canceled' vira 'cancelled'). */
export function chargeStatusToPaymentStatus(status: ChargeStatus): string {
  return status === "canceled" ? "cancelled" : status;
}

/** Provider de recebedor padrão da plataforma. */
export const DEFAULT_PROVIDER = "pagarme";

export function getGateway(provider: string = DEFAULT_PROVIDER): PaymentGateway {
  switch (provider) {
    case "pagarme":
      // @ts-expect-error - Deno env (resolvido em runtime na Edge Function)
      return new PagarmeGateway(Deno.env.get("PAGARME_SECRET_KEY"));
    case "mock":
      return new MockGateway();
    default:
      throw new Error(`Gateway de pagamento desconhecido: ${provider}`);
  }
}
