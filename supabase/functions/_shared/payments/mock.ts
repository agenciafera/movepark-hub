// Gateway mock — paridade com `payment.provider = 'mock'`. Não chama rede; aprova na hora.
// Útil para testes da camada de vínculo e para ambientes sem credencial de gateway.

import type { PaymentGateway, RecipientInput, RecipientResult } from "./types.ts";

export class MockGateway implements PaymentGateway {
  readonly provider = "mock";

  createRecipient(input: RecipientInput): Promise<RecipientResult> {
    return Promise.resolve({
      externalId: `mock_rcv_${input.externalCode}`,
      status: "active",
      rawStatus: "active",
      kycUrl: null,
      requirements: [],
      raw: { mock: true },
      httpStatus: 200,
    });
  }

  getRecipient(externalId: string): Promise<RecipientResult> {
    return Promise.resolve({
      externalId,
      status: "active",
      rawStatus: "active",
      kycUrl: null,
      requirements: [],
      raw: { mock: true },
      httpStatus: 200,
    });
  }
}
