// Fábrica de gateway — ÚNICO ponto de dispatch por provider. O resto do código pede
// `getGateway(provider)` e fala só pela interface `PaymentGateway` (ADR-004).

import type { PaymentGateway } from "./types.ts";
import { PagarmeGateway } from "./pagarme.ts";
import { MockGateway } from "./mock.ts";

export * from "./types.ts";

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
